import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import {
  commercialInvoices,
  containers,
  logisticsBills,
  orders,
  payments,
  shippingDocuments,
  vendorBills,
  containerAllocations,
} from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import { getErrorMessage } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

type RollbackAction = 'UNDO_MARK_DELIVERED' | 'UNDO_START_TRANSIT' | 'UNDO_SHIPPING_DOC';



function normalizeAction(value: unknown): RollbackAction | null {
  if (value === 'UNDO_MARK_DELIVERED') return value;
  if (value === 'UNDO_START_TRANSIT') return value;
  if (value === 'UNDO_SHIPPING_DOC') return value;
  return null;
}

async function deletePaymentsByTarget(targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL', targetIds: string[]) {
  if (targetIds.length === 0) return 0;
  const rows = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.targetType, targetType), inArray(payments.targetId, targetIds)));

  if (rows.length > 0) {
    await db
      .delete(payments)
      .where(and(eq(payments.targetType, targetType), inArray(payments.targetId, targetIds)));
  }
  return rows.length;
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const body = (await req.json()) as { action?: RollbackAction };
    const action = normalizeAction(body.action);
    if (!action) {
      return NextResponse.json(
        { error: 'action must be one of UNDO_MARK_DELIVERED, UNDO_START_TRANSIT, UNDO_SHIPPING_DOC' },
        { status: 400 }
      );
    }

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const [shippingRows, allocationRows, invoiceRows, vendorRows, logisticsRows] = await Promise.all([
      db.select({ id: shippingDocuments.id, containerId: shippingDocuments.containerId }).from(shippingDocuments).where(eq(shippingDocuments.orderId, id)),
      db.select({ id: containerAllocations.id, containerId: containerAllocations.containerId }).from(containerAllocations).where(eq(containerAllocations.orderId, id)),
      db.select({ id: commercialInvoices.id }).from(commercialInvoices).where(eq(commercialInvoices.orderId, id)),
      db.select({ id: vendorBills.id }).from(vendorBills).where(eq(vendorBills.orderId, id)),
      db.select({ id: logisticsBills.id, containerId: logisticsBills.containerId }).from(logisticsBills).where(eq(logisticsBills.orderId, id)),
    ]);

    const shippingIds = shippingRows.map((row) => row.id);
    const invoiceIds = invoiceRows.map((row) => row.id);
    const vendorIds = vendorRows.map((row) => row.id);
    const logisticsIds = logisticsRows.map((row) => row.id);
    const containerIds = Array.from(
      new Set([
        ...shippingRows.map((row) => row.containerId).filter((x): x is string => !!x),
        ...allocationRows.map((row) => row.containerId).filter((x): x is string => !!x),
        ...logisticsRows.map((row) => row.containerId).filter((x): x is string => !!x),
      ])
    );

    const removed = {
      shippingDocuments: 0,
      commercialInvoices: 0,
      vendorBills: 0,
      logisticsBills: 0,
      payments: 0,
    };

    if (action === 'UNDO_MARK_DELIVERED' || action === 'UNDO_START_TRANSIT' || action === 'UNDO_SHIPPING_DOC') {
      removed.payments += await deletePaymentsByTarget('LOGISTICS_BILL', logisticsIds);
      if (logisticsIds.length > 0) {
        await db.delete(logisticsBills).where(eq(logisticsBills.orderId, id));
        removed.logisticsBills = logisticsIds.length;
      }

      await db
        .update(orders)
        .set({ deliveredAt: null, closedAt: null })
        .where(eq(orders.id, id));
    }

    if (action === 'UNDO_START_TRANSIT' || action === 'UNDO_SHIPPING_DOC') {
      removed.payments += await deletePaymentsByTarget('CUSTOMER_INVOICE', invoiceIds);
      removed.payments += await deletePaymentsByTarget('VENDOR_BILL', vendorIds);

      if (invoiceIds.length > 0) {
        await db.delete(commercialInvoices).where(eq(commercialInvoices.orderId, id));
        removed.commercialInvoices = invoiceIds.length;
      }
      if (vendorIds.length > 0) {
        await db.delete(vendorBills).where(eq(vendorBills.orderId, id));
        removed.vendorBills = vendorIds.length;
      }
    }

    if (action === 'UNDO_SHIPPING_DOC') {
      if (shippingIds.length > 0) {
        await db.delete(shippingDocuments).where(eq(shippingDocuments.orderId, id));
        removed.shippingDocuments = shippingIds.length;
      }
    }

    if (containerIds.length > 0) {
      if (action === 'UNDO_MARK_DELIVERED') {
        await db
          .update(containers)
          .set({
            status: 'IN_TRANSIT',
            ata: null,
            arrivalAtWarehouse: null,
          })
          .where(inArray(containers.id, containerIds));
      } else if (action === 'UNDO_START_TRANSIT' || action === 'UNDO_SHIPPING_DOC') {
        await db
          .update(containers)
          .set({
            status: 'PLANNED',
            atd: null,
            ata: null,
            arrivalAtWarehouse: null,
          })
          .where(inArray(containers.id, containerIds));
      }
    }

    const updatedOrder = await recomputeOrderWorkflowStatus(id);

    return NextResponse.json({
      success: true,
      data: {
        action,
        removed,
        workflowStatus: updatedOrder?.workflowStatus ?? null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
