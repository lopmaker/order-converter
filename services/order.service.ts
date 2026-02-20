import { db } from '@/db';
import { orders, orderItems, tariffRates, vendors } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { calculateEstimatedMargin, parseDecimalInput, round2, round4 } from '@/lib/workflow';
import {
    deriveTariffKey,
    inferOriginCountry,
    normalizeTariffKey,
    resolveTariffRate,
} from '@/lib/tariffs';
import { saveOrderSchema } from '@/lib/schemas';
import { z } from 'zod';

type SaveOrderPayload = z.infer<typeof saveOrderSchema>;

export async function createOrderFromExtraction(data: SaveOrderPayload) {
    // 1. Preparation
    const originCountry = inferOriginCountry(data.supplierName || '', data.supplierAddress || '');

    const tariffRows = await db
        .select({ productClass: tariffRates.productClass, tariffRate: tariffRates.tariffRate })
        .from(tariffRates);

    const tariffMap = new Map<string, number>(
        tariffRows.map((row) => [normalizeTariffKey(row.productClass), Number(row.tariffRate || 0)])
    );

    // 1.5 Auto-save Vendor if new
    if (data.supplierName) {
        const existingVendor = await db
            .select()
            .from(vendors)
            .where(eq(vendors.name, data.supplierName))
            .limit(1);

        if (existingVendor.length === 0) {
            await db.insert(vendors).values({
                name: data.supplierName,
                address: data.supplierAddress || null,
            });
        }
    }

    // 2. Item Compilation
    const itemPayloads = (data.items || []).map((item) => {
        const baseTariffKey = deriveTariffKey({
            description: item.description || '',
            collection: item.collection || '',
            material: item.material || '',
        });

        // We treat incoming quantity as 0 if un-parseable string in original logic, 
        // but the payload now has number via zod.
        const qty = Math.max(0, item.quantity || 0);
        const customerUnitPrice = item.customerUnitPrice ?? item.unitPrice ?? 0;
        const vendorUnitPrice = item.vendorUnitPrice ?? 0;

        const tariffRate = resolveTariffRate({
            baseTariffKey,
            originCountry,
            tariffMap,
        }).rate;

        const estimate = calculateEstimatedMargin({
            customerUnitPrice,
            vendorUnitPrice,
            qty,
            tariffRate,
        });

        return {
            orderId: '', // placeholder, will set after order insertion
            productCode: item.productCode,
            description: item.description,
            quantity: qty,
            unitPrice: customerUnitPrice.toFixed(2),
            customerUnitPrice: customerUnitPrice.toFixed(2),
            vendorUnitPrice: vendorUnitPrice.toFixed(2),
            total: estimate.customerRevenue.toFixed(2),
            tariffRate: round4(tariffRate).toFixed(4),
            estimatedDutyCost: estimate.dutyCost.toFixed(2),
            estimated3plCost: estimate.estimated3plCost.toFixed(2),
            estimatedMargin: estimate.estimatedMargin.toFixed(2),
            color: item.color,
            material: item.material,
            sizeBreakdown: item.sizeBreakdown ? JSON.stringify(item.sizeBreakdown) : null,
            productClass: baseTariffKey,
            collection: item.collection,
        };
    });

    const totalRevenue = round2(
        itemPayloads.reduce((sum, item) => sum + Number(item.total || 0), 0)
    );
    const totalEstimatedMargin = round2(
        itemPayloads.reduce((sum, item) => sum + Number(item.estimatedMargin || 0), 0)
    );
    const totalEstimatedMarginRate =
        totalRevenue > 0 ? round4(totalEstimatedMargin / totalRevenue) : 0;

    // 3. Database Insertion (Orders)
    const [insertedOrder] = await db
        .insert(orders)
        .values({
            vpoNumber: data.vpoNumber,
            customerName: data.customerName,
            customerAddress: data.customerAddress,
            supplierName: data.supplierName,
            supplierAddress: data.supplierAddress,
            orderDate: data.orderDate,
            totalAmount: totalRevenue.toFixed(2),
            status: 'Confirmed',
            workflowStatus: 'PO_UPLOADED',
            soReference: data.soReference,
            expShipDate: data.expShipDate,
            cancelDate: data.cancelDate,
            shipTo: data.shipTo,
            shipVia: data.shipVia,
            shipmentTerms: data.shipmentTerms,
            paymentTerms: data.paymentTerms,
            customerNotes: data.customerNotes,
            estimatedMargin: totalEstimatedMargin.toFixed(2),
            estimatedMarginRate: totalEstimatedMarginRate.toFixed(4),
            customerTermDays: data.customerTermDays || 30,
            vendorTermDays: data.vendorTermDays || 30,
            logisticsTermDays: data.logisticsTermDays || 15,
        } as any)
        .returning({ id: orders.id });

    if (!insertedOrder) {
        throw new Error('Failed to insert order into database');
    }

    // 4. Database Insertion (Items)
    if (itemPayloads.length > 0) {
        await db.insert(orderItems).values(
            itemPayloads.map((item) => ({
                ...item,
                orderId: insertedOrder.id,
            }))
        );
    }

    return {
        orderId: insertedOrder.id,
        totals: {
            revenue: totalRevenue,
            estimatedMargin: totalEstimatedMargin,
            estimatedMarginRate: totalEstimatedMarginRate,
        },
    };
}
