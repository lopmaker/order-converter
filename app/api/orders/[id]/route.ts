import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, tariffRates } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { calculateEstimatedMargin, parseDecimalInput, round2, round4 } from '@/lib/workflow';
import {
  deriveTariffKey,
  inferOriginCountry,
  normalizeTariffKey,
  resolveTariffRate,
} from '@/lib/tariffs';
import { getErrorMessage } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

import { orderPatchSchema } from '@/lib/validation';



const ITEM_STRING_FIELDS = [
  'productCode',
  'description',
  'collection',
  'color',
  'material',
  'productClass',
  'sizeBreakdown',
] as const;



async function recalculateOrderTotals(orderId: string) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const totalRevenue = round2(
    items.reduce((sum, item) => sum + parseDecimalInput(item.total, 0), 0)
  );
  const totalEstimatedMargin = round2(
    items.reduce((sum, item) => sum + parseDecimalInput(item.estimatedMargin, 0), 0)
  );
  const totalEstimatedMarginRate =
    totalRevenue > 0 ? round4(totalEstimatedMargin / totalRevenue) : 0;

  await db
    .update(orders)
    .set({
      totalAmount: totalRevenue.toFixed(2),
      estimatedMargin: totalEstimatedMargin.toFixed(2),
      estimatedMarginRate: totalEstimatedMarginRate.toFixed(4),
    })
    .where(eq(orders.id, orderId));
}

// GET: Fetch a single order with items
export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id));

    return NextResponse.json({ ...order, items });
  } catch (error: unknown) {
    console.error('Fetch Order Error:', error);
    return NextResponse.json(
      { error: `Failed to fetch order: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

// DELETE: Remove an order
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    await db.delete(orders).where(eq(orders.id, id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Delete Order Error:', error);
    return NextResponse.json(
      { error: `Failed to delete order: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}

// PATCH: Update order fields
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });

    return await db.transaction(async (tx) => {
      const currentOrder = await tx.query.orders.findFirst({
        where: eq(orders.id, id),
      });
      if (!currentOrder) {
        tx.rollback();
        return NextResponse.json({ error: 'Order not found' }, { status: 404 });
      }

      const rawBody = await req.json();
      const parsedBody = orderPatchSchema.safeParse(rawBody);

      if (!parsedBody.success) {
        tx.rollback();
        return NextResponse.json({ error: 'Invalid request body', issues: parsedBody.error.issues }, { status: 400 });
      }

      const updateData: Partial<typeof orders.$inferInsert> = {};
      const { items, ...orderFields } = parsedBody.data;

      // Directly assign validated fields to updateData
      Object.assign(updateData, orderFields);

      // Handle Date fields
      if (orderFields.orderDate !== undefined) updateData.orderDate = orderFields.orderDate ? new Date(orderFields.orderDate) : null;
      if (orderFields.expShipDate !== undefined) updateData.expShipDate = orderFields.expShipDate ? new Date(orderFields.expShipDate) : null;
      if (orderFields.cancelDate !== undefined) updateData.cancelDate = orderFields.cancelDate ? new Date(orderFields.cancelDate) : null;
      if (orderFields.deliveredAt !== undefined) updateData.deliveredAt = orderFields.deliveredAt ? new Date(orderFields.deliveredAt) : null;
      if (orderFields.closedAt !== undefined) updateData.closedAt = orderFields.closedAt ? new Date(orderFields.closedAt) : null;

      const hasItemUpdates = items !== undefined;

      if (Object.keys(updateData).length === 0 && !hasItemUpdates) {
        tx.rollback();
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
      }

      if (Object.keys(updateData).length > 0) {
        await tx.update(orders).set(updateData).where(eq(orders.id, id));
      }

      if (hasItemUpdates) {
        // Zod has already ensured items is an array of validated order items
        if (!items) {
          tx.rollback();
          return NextResponse.json({ error: 'Invalid item data' }, { status: 400 });
        }

        const supplierNameForTariff =
          (orderFields.supplierName !== undefined ? orderFields.supplierName : undefined) ??
          currentOrder.supplierName;
        const supplierAddressForTariff =
          (orderFields.supplierAddress !== undefined
            ? orderFields.supplierAddress
            : undefined) ?? currentOrder.supplierAddress;
        const originCountry = inferOriginCountry(supplierNameForTariff, supplierAddressForTariff);

        const tariffRows = await tx
          .select({ productClass: tariffRates.productClass, tariffRate: tariffRates.tariffRate })
          .from(tariffRates);
        const tariffMap = new Map<string, number>(
          tariffRows.map((row) => [
            normalizeTariffKey(row.productClass),
            parseDecimalInput(row.tariffRate, 0),
          ])
        );

        const itemUpdateActions: Promise<any>[] = [];

        for (const item of items) {
          if (!item.id) {
            // For new items, we might need a different flow (e.g., insert) or reject if not supported
            // For now, let's skip items without an ID as this is a PATCH (update) endpoint
            console.warn('Skipping item without ID in PATCH request:', item);
            continue;
          }

          const existing = await tx.query.orderItems.findFirst({
            where: and(eq(orderItems.id, item.id), eq(orderItems.orderId, id)),
          });

          if (!existing) continue;

          const itemUpdate: Partial<typeof orderItems.$inferInsert> = {};

          for (const field of ITEM_STRING_FIELDS) {
            if (item[field] !== undefined) {
              itemUpdate[field] = item[field] as typeof orderItems.$inferInsert[typeof field];
            }
          }

          if (item.quantity !== undefined) {
            itemUpdate.quantity = item.quantity;
          }

          if (item.unitPrice !== undefined) {
            itemUpdate.unitPrice = item.unitPrice;
          }

          const customerUnitPrice = item.customerUnitPrice ?? item.unitPrice;
          if (customerUnitPrice !== undefined) {
            itemUpdate.customerUnitPrice = customerUnitPrice;
          }

          if (item.vendorUnitPrice !== undefined) {
            itemUpdate.vendorUnitPrice = item.vendorUnitPrice;
          }

          const qtyVal = parseDecimalInput(itemUpdate.quantity ?? existing.quantity, 0);
          const customerUnitVal = parseDecimalInput(
            itemUpdate.customerUnitPrice ??
              itemUpdate.unitPrice ??
              existing.customerUnitPrice ??
              existing.unitPrice,
            0
          );
          const vendorUnitVal = parseDecimalInput(
            itemUpdate.vendorUnitPrice ?? existing.vendorUnitPrice,
            0
          );
          const baseTariffKey = deriveTariffKey({
            description: (itemUpdate.description as string | null) ?? existing.description,
            collection: (itemUpdate.collection as string | null) ?? existing.collection,
            material: (itemUpdate.material as string | null) ?? existing.material,
          });
          const tariffRateVal = resolveTariffRate({
            baseTariffKey,
            originCountry,
            tariffMap,
          }).rate;

          const estimate = calculateEstimatedMargin({
            customerUnitPrice: customerUnitVal,
            vendorUnitPrice: vendorUnitVal,
            qty: qtyVal,
            tariffRate: tariffRateVal,
          });

          itemUpdate.unitPrice = customerUnitVal.toFixed(2);
          itemUpdate.customerUnitPrice = customerUnitVal.toFixed(2);
          itemUpdate.total = estimate.customerRevenue.toFixed(2);
          itemUpdate.productClass = baseTariffKey;
          itemUpdate.tariffRate = round4(tariffRateVal).toFixed(4);
          itemUpdate.estimatedDutyCost = estimate.dutyCost.toFixed(2);
          itemUpdate.estimated3plCost = estimate.estimated3plCost.toFixed(2);
          itemUpdate.estimatedMargin = estimate.estimatedMargin.toFixed(2);

          if (Object.keys(itemUpdate).length > 0) {
            itemUpdateActions.push(
              tx.update(orderItems).set(itemUpdate).where(eq(orderItems.id, item.id))
            );
          }
        }

        await Promise.all(itemUpdateActions);
        await recalculateOrderTotals(id);
      }

      return NextResponse.json({ success: true });
    });
  } catch (error: unknown) {
    console.error('Update Order Error:', error);
    return NextResponse.json(
      { error: `Failed to update order: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
