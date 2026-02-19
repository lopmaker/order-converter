import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, tariffRates } from '@/db/schema';
import { ExtractedOrderData } from '@/lib/parser';
import { calculateEstimatedMargin, parseDecimalInput, round2, round4 } from '@/lib/workflow';
import {
  deriveTariffKey,
  inferOriginCountry,
  normalizeTariffKey,
  resolveTariffRate,
} from '@/lib/tariffs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data: ExtractedOrderData = body;

    if (!data.vpoNumber) {
      return NextResponse.json({ error: 'VPO Number is required' }, { status: 400 });
    }

    const originCountry = inferOriginCountry(data.supplierName, data.supplierAddress);
    const tariffRows = await db
      .select({ productClass: tariffRates.productClass, tariffRate: tariffRates.tariffRate })
      .from(tariffRates);
    const tariffMap = new Map<string, number>(
      tariffRows.map((row) => [normalizeTariffKey(row.productClass), Number(row.tariffRate || 0)])
    );

    const itemPayloads = data.items.map((item) => {
      const baseTariffKey = deriveTariffKey({
        description: item.description,
        collection: item.collection,
        material: item.material,
      });
      const qty = Math.max(0, parseDecimalInput(item.totalQty, 0));
      const customerUnitPrice = parseDecimalInput(item.customerUnitPrice ?? item.unitPrice, 0);
      const vendorUnitPrice = parseDecimalInput(item.vendorUnitPrice, 0);
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
        orderId: '',
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
      } as any)
      .returning({ id: orders.id });

    if (!insertedOrder) {
      throw new Error('Failed to insert order');
    }

    if (itemPayloads.length > 0) {
      await db.insert(orderItems).values(
        itemPayloads.map((item) => ({
          ...item,
          orderId: insertedOrder.id,
        }))
      );
    }

    return NextResponse.json({
      success: true,
      orderId: insertedOrder.id,
      totals: {
        revenue: totalRevenue,
        estimatedMargin: totalEstimatedMargin,
        estimatedMarginRate: totalEstimatedMarginRate,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Save Order Error:', error);
    return NextResponse.json({ error: `Failed to save order: ${message}` }, { status: 500 });
  }
}
