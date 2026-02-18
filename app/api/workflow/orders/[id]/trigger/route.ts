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
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDays, parseDecimalInput, round2 } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import { getErrorMessage, createDefaultCode } from '@/lib/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

type TriggerAction = 'GENERATE_SHIPPING_DOC' | 'START_TRANSIT' | 'MARK_DELIVERED';



function getVendorAmount(items: Array<{ quantity: number | null; vendorUnitPrice: string | null }>): number {
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
  if (normalized === 'GENERATE_SHIPPING_DOC') return 'GENERATE_SHIPPING_DOC';
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
        { error: 'action must be one of GENERATE_SHIPPING_DOC, START_TRANSIT, MARK_DELIVERED' },
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
      updated: {},
    };

    if (action === 'GENERATE_SHIPPING_DOC') {
      const existingDoc = containerId
        ? await db.query.shippingDocuments.findFirst({
          where: and(eq(shippingDocuments.orderId, id), eq(shippingDocuments.containerId, containerId)),
        })
        : await db.query.shippingDocuments.findFirst({
          where: eq(shippingDocuments.orderId, id),
        });

      if (existingDoc) {
        result.created = { shippingDocument: false };
        result.shippingDocument = existingDoc;
      } else {
        const [shippingDoc] = await db
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
        result.created = { shippingDocument: true };
        result.shippingDocument = shippingDoc;
      }

      await db
        .update(orders)
        .set({ workflowStatus: 'SHIPPING_DOC_SENT' })
        .where(eq(orders.id, id));
      result.updated = { workflowStatus: 'SHIPPING_DOC_SENT' };
    }

    if (action === 'START_TRANSIT') {
      const existingDoc = containerId
        ? await db.query.shippingDocuments.findFirst({
          where: and(eq(shippingDocuments.orderId, id), eq(shippingDocuments.containerId, containerId)),
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
          .set({
            status: 'IN_TRANSIT',
            atd: new Date(),
          })
          .where(eq(containers.id, containerId));
      }

      await db
        .update(orders)
        .set({ workflowStatus: 'IN_TRANSIT' })
        .where(eq(orders.id, id));

      result.created = {
        shippingDocument: !existingDoc,
        commercialInvoice: !existingInvoice,
        vendorBill: !existingVendorBill,
      };
      result.updated = { workflowStatus: 'IN_TRANSIT' };
      result.shippingDocument = shippingDoc;
      result.commercialInvoice = invoice;
      result.vendorBill = vendorBill;
    }

    if (action === 'MARK_DELIVERED') {
      const deliveredAt = body.deliveredAt ? new Date(body.deliveredAt) : new Date();

      await db
        .update(orders)
        .set({
          deliveredAt,
          workflowStatus: 'AR_AP_OPEN',
        })
        .where(eq(orders.id, id));

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

      result.created = { logisticsBill: false };
      result.updated = {
        workflowStatus: 'AR_AP_OPEN',
        deliveredAt: deliveredAt.toISOString(),
      };
      result.logisticsBill = null;
    }

    const recomputed = await recomputeOrderWorkflowStatus(id);
    if (recomputed) {
      result.updated = {
        ...(result.updated as Record<string, unknown>),
        workflowStatus: recomputed.workflowStatus,
      };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
