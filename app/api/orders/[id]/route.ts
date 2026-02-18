import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders, orderItems, tariffRates } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { calculateEstimatedMargin, parseDecimalInput, round2, round4 } from '@/lib/workflow';
import { deriveTariffKey, inferOriginCountry, normalizeTariffKey, resolveTariffRate } from '@/lib/tariffs';
import { getErrorMessage } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

type JsonRecord = Record<string, unknown>;

const ORDER_STRING_FIELDS = [
  'vpoNumber',
  'customerName',
  'customerAddress',
  'supplierName',
  'supplierAddress',
  'orderDate',
  'status',
  'workflowStatus',
  'soReference',
  'expShipDate',
  'cancelDate',
  'shipTo',
  'shipVia',
  'shipmentTerms',
  'paymentTerms',
  'customerNotes',
] as const;

const ITEM_STRING_FIELDS = [
  'productCode',
  'description',
  'collection',
  'color',
  'material',
  'productClass',
  'sizeBreakdown',
] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function toStringOrUndefined(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return undefined;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toDecimalStringOrUndefined(value: unknown): string | undefined {
  const parsed = toNumberOrUndefined(value);
  if (parsed !== undefined) return parsed.toString();
  if (typeof value === 'string') return value;
  return undefined;
}



async function recalculateOrderTotals(orderId: string) {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  const totalRevenue = round2(items.reduce((sum, item) => sum + parseDecimalInput(item.total, 0), 0));
  const totalEstimatedMargin = round2(
    items.reduce((sum, item) => sum + parseDecimalInput(item.estimatedMargin, 0), 0)
  );
  const totalEstimatedMarginRate = totalRevenue > 0 ? round4(totalEstimatedMargin / totalRevenue) : 0;

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

    const currentOrder = await db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    if (!currentOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const rawBody: unknown = await req.json();
    if (!isRecord(rawBody)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updateData: Partial<typeof orders.$inferInsert> = {};

    for (const field of ORDER_STRING_FIELDS) {
      const value = toStringOrUndefined(rawBody[field]);
      if (value !== undefined) {
        updateData[field] = value;
      }
    }

    const deliveredAt = toStringOrUndefined(rawBody.deliveredAt);
    if (deliveredAt !== undefined) {
      updateData.deliveredAt = deliveredAt ? new Date(deliveredAt) : null;
    }

    const totalAmount = toDecimalStringOrUndefined(rawBody.totalAmount);
    if (totalAmount !== undefined) {
      updateData.totalAmount = totalAmount;
    }

    const estimatedMargin = toDecimalStringOrUndefined(rawBody.estimatedMargin);
    if (estimatedMargin !== undefined) {
      updateData.estimatedMargin = estimatedMargin;
    }

    const estimatedMarginRate = toDecimalStringOrUndefined(rawBody.estimatedMarginRate);
    if (estimatedMarginRate !== undefined) {
      updateData.estimatedMarginRate = estimatedMarginRate;
    }

    const rawItems = rawBody.items;
    const hasItemUpdates = Array.isArray(rawItems);

    if (Object.keys(updateData).length === 0 && !hasItemUpdates) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(orders).set(updateData).where(eq(orders.id, id));
    }

    if (hasItemUpdates) {
      const validItems = rawItems.filter(
        (rawItem): rawItem is JsonRecord & { id: string } =>
          isRecord(rawItem) && typeof rawItem.id === 'string'
      );

      const supplierNameForTariff =
        (typeof updateData.supplierName === 'string' ? updateData.supplierName : undefined) ??
        currentOrder.supplierName;
      const supplierAddressForTariff =
        (typeof updateData.supplierAddress === 'string' ? updateData.supplierAddress : undefined) ??
        currentOrder.supplierAddress;
      const originCountry = inferOriginCountry(supplierNameForTariff, supplierAddressForTariff);

      const tariffRows = await db
        .select({ productClass: tariffRates.productClass, tariffRate: tariffRates.tariffRate })
        .from(tariffRates);
      const tariffMap = new Map<string, number>(
        tariffRows.map((row) => [normalizeTariffKey(row.productClass), parseDecimalInput(row.tariffRate, 0)])
      );

      for (const rawItem of validItems) {
        const existing = await db.query.orderItems.findFirst({
          where: and(eq(orderItems.id, rawItem.id), eq(orderItems.orderId, id)),
        });

        if (!existing) continue;

        const itemUpdate: Partial<typeof orderItems.$inferInsert> = {};

        for (const field of ITEM_STRING_FIELDS) {
          const value = toStringOrUndefined(rawItem[field]);
          if (value !== undefined) {
            itemUpdate[field] = value;
          }
        }

        const quantity = toNumberOrUndefined(rawItem.quantity);
        if (quantity !== undefined) {
          itemUpdate.quantity = quantity;
        }

        const unitPrice = toDecimalStringOrUndefined(rawItem.unitPrice);
        if (unitPrice !== undefined) {
          itemUpdate.unitPrice = unitPrice;
        }

        const customerUnitPrice = toDecimalStringOrUndefined(rawItem.customerUnitPrice ?? rawItem.unitPrice);
        if (customerUnitPrice !== undefined) {
          itemUpdate.customerUnitPrice = customerUnitPrice;
        }

        const vendorUnitPrice = toDecimalStringOrUndefined(rawItem.vendorUnitPrice);
        if (vendorUnitPrice !== undefined) {
          itemUpdate.vendorUnitPrice = vendorUnitPrice;
        }

        const qty = parseDecimalInput(itemUpdate.quantity ?? existing.quantity, 0);
        const customerUnit = parseDecimalInput(
          itemUpdate.customerUnitPrice ?? itemUpdate.unitPrice ?? existing.customerUnitPrice ?? existing.unitPrice,
          0
        );
        const vendorUnit = parseDecimalInput(itemUpdate.vendorUnitPrice ?? existing.vendorUnitPrice, 0);
        const baseTariffKey = deriveTariffKey({
          description: (itemUpdate.description as string | null | undefined) ?? existing.description,
          collection: (itemUpdate.collection as string | null | undefined) ?? existing.collection,
          material: (itemUpdate.material as string | null | undefined) ?? existing.material,
        });
        const tariffRate = resolveTariffRate({
          baseTariffKey,
          originCountry,
          tariffMap,
        }).rate;

        const estimate = calculateEstimatedMargin({
          customerUnitPrice: customerUnit,
          vendorUnitPrice: vendorUnit,
          qty,
          tariffRate,
        });

        itemUpdate.unitPrice = customerUnit.toFixed(2);
        itemUpdate.customerUnitPrice = customerUnit.toFixed(2);
        itemUpdate.total = estimate.customerRevenue.toFixed(2);
        itemUpdate.productClass = baseTariffKey;
        itemUpdate.tariffRate = round4(tariffRate).toFixed(4);
        itemUpdate.estimatedDutyCost = estimate.dutyCost.toFixed(2);
        itemUpdate.estimated3plCost = estimate.estimated3plCost.toFixed(2);
        itemUpdate.estimatedMargin = estimate.estimatedMargin.toFixed(2);

        if (Object.keys(itemUpdate).length > 0) {
          await db.update(orderItems).set(itemUpdate).where(eq(orderItems.id, rawItem.id));
        }
      }

      await recalculateOrderTotals(id);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Update Order Error:', error);
    return NextResponse.json(
      { error: `Failed to update order: ${getErrorMessage(error)}` },
      { status: 500 }
    );
  }
}
