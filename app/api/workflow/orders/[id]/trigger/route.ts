import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  commercialInvoices,
  containerAllocations,
  containers,
  orderItems,
  orders,
  shippingDocuments,
  vendorBills,
  logisticsBills,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDays, parseDecimalInput, round2 } from '@/lib/finance-math';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import { getErrorMessage, createDefaultCode } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

type TriggerAction = 'START_TRANSIT' | 'MARK_DELIVERED';

function getVendorAmount(
  items: Array<{ quantity: number | null; vendorUnitPrice: string | null }>
): number {
  return round2(
    items.reduce(
      (sum, item) =>
        sum + parseDecimalInput(item.quantity, 0) * parseDecimalInput(item.vendorUnitPrice, 0),
      0
    )
  );
}

function normalizeAction(action?: string): TriggerAction | null {
  const normalized = (action || '').trim().toUpperCase();
  if (normalized === 'START_TRANSIT') return 'START_TRANSIT';
  if (normalized === 'MARK_DELIVERED') return 'MARK_DELIVERED';
  return null;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const body = (await req.json()) as {
      action?: string;
      containerId?: string;
      deliveredAt?: string;
    };

    const action = normalizeAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: 'action must be one of START_TRANSIT, MARK_DELIVERED' },
        { status: 400 }
      );
    }

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const items = await db
      .select({
        quantity: orderItems.quantity,
        vendorUnitPrice: orderItems.vendorUnitPrice,
        estimated3plCost: orderItems.estimated3plCost,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));

    let containerId = body.containerId || null;
    if (!containerId) {
      const allocation = await db.query.containerAllocations.findFirst({
        where: eq(containerAllocations.orderId, id),
      });
      containerId = allocation?.containerId ?? null;
    }

    const result: Record<string, unknown> = {
      action,
      orderId: id,
      created: {},
    };

    if (action === 'START_TRANSIT') {
      const existingDoc = containerId
        ? await db.query.shippingDocuments.findFirst({
            where: and(
              eq(shippingDocuments.orderId, id),
              eq(shippingDocuments.containerId, containerId)
            ),
          })
        : await db.query.shippingDocuments.findFirst({
            where: eq(shippingDocuments.orderId, id),
          });

      let shippingDoc = existingDoc;
      if (!shippingDoc) {
        const [createdDoc] = await db
          .insert(shippingDocuments)
          .values({
            orderId: id,
            containerId,
            docNo: createDefaultCode('SD'),
            issueDate: new Date(),
            status: 'ISSUED',
            payload: JSON.stringify({
              vpoNumber: order.vpoNumber,
              shipTo: order.shipTo,
              supplierName: order.supplierName,
            }),
          })
          .returning();
        shippingDoc = createdDoc;
      }

      const existingInvoice = await db.query.commercialInvoices.findFirst({
        where: eq(commercialInvoices.orderId, id),
      });

      let invoice = existingInvoice;
      if (!invoice) {
        const issueDate = new Date();
        const dueDate = addDays(issueDate, order.customerTermDays ?? 30);
        const [createdInvoice] = await db
          .insert(commercialInvoices)
          .values({
            orderId: id,
            containerId,
            invoiceNo: createDefaultCode('CI'),
            issueDate,
            dueDate,
            amount: parseDecimalInput(order.totalAmount, 0).toFixed(2),
            currency: 'USD',
            status: 'OPEN',
          })
          .returning();
        invoice = createdInvoice;
      }

      const existingVendorBill = await db.query.vendorBills.findFirst({
        where: eq(vendorBills.orderId, id),
      });

      let vendorBill = existingVendorBill;
      if (!vendorBill) {
        const issueDate = new Date();
        const dueDate = addDays(issueDate, order.vendorTermDays ?? 30);
        const [createdVendorBill] = await db
          .insert(vendorBills)
          .values({
            orderId: id,
            billNo: createDefaultCode('VB'),
            issueDate,
            dueDate,
            amount: getVendorAmount(items).toFixed(2),
            currency: 'USD',
            status: 'OPEN',
          })
          .returning();
        vendorBill = createdVendorBill;
      }

      if (containerId) {
        await db
          .update(containers)
          .set({ status: 'IN_TRANSIT', atd: new Date() })
          .where(eq(containers.id, containerId));
      }

      result.created = {
        shippingDocument: !existingDoc,
        commercialInvoice: !existingInvoice,
        vendorBill: !existingVendorBill,
      };
      result.shippingDocument = shippingDoc;
      result.commercialInvoice = invoice;
      result.vendorBill = vendorBill;
    }

    if (action === 'MARK_DELIVERED') {
      const deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : new Date();

      await db.update(orders).set({ deliveredAt }).where(eq(orders.id, id));

      if (containerId) {
        await db
          .update(containers)
          .set({
            status: 'ARRIVED',
            ata: deliveredAt,
            arrivalAtWarehouse: deliveredAt,
          })
          .where(eq(containers.id, containerId));
      }

      const existingLogisticsBill = await db.query.logisticsBills.findFirst({
        where: eq(logisticsBills.orderId, id),
      });

      let logisticsBill = existingLogisticsBill;
      if (!logisticsBill) {
        const total3pl = items.reduce(
          (sum, item) => sum + parseDecimalInput(item.estimated3plCost, 0),
          0
        );
        const issueDate = new Date();
        const dueDate = addDays(issueDate, order.logisticsTermDays ?? 15);
        const [createdLogisticsBill] = await db
          .insert(logisticsBills)
          .values({
            orderId: id,
            containerId,
            billNo: createDefaultCode('3PL'),
            provider: 'Auto 3PL',
            issueDate,
            dueDate,
            amount: total3pl.toFixed(2),
            currency: 'USD',
            status: 'OPEN',
          })
          .returning();
        logisticsBill = createdLogisticsBill;
      }

      result.created = { logisticsBill: !existingLogisticsBill };
      result.deliveredAt = deliveredAt.toISOString();
      result.logisticsBill = logisticsBill;
    }

    const recomputed = await recomputeOrderWorkflowStatus(id);
    result.workflowStatus = recomputed?.workflowStatus ?? null;

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
