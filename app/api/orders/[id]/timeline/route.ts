import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  commercialInvoices,
  containerAllocations,
  containers,
  logisticsBills,
  orders,
  payments,
  shippingDocuments,
  vendorBills,
} from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { parseDecimalInput, round2 } from '@/lib/workflow';

type RouteContext = { params: Promise<{ id: string }> };

type TimelineEventType =
  | 'ORDER_CREATED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CLOSED'
  | 'SHIPPING_DOC_ISSUED'
  | 'CONTAINER_ALLOCATED'
  | 'CONTAINER_ATD'
  | 'CONTAINER_ATA'
  | 'WAREHOUSE_ARRIVAL'
  | 'AR_OPENED'
  | 'VENDOR_AP_OPENED'
  | 'LOGISTICS_AP_OPENED'
  | 'PAYMENT_POSTED';

type TimelineEntityType =
  | 'ORDER'
  | 'SHIPPING_DOCUMENT'
  | 'CONTAINER_ALLOCATION'
  | 'CONTAINER'
  | 'COMMERCIAL_INVOICE'
  | 'VENDOR_BILL'
  | 'LOGISTICS_BILL'
  | 'PAYMENT';

type TimelineEvent = {
  id: string;
  at: string | null;
  type: TimelineEventType;
  title: string;
  description: string | null;
  status: string | null;
  entityType: TimelineEntityType;
  entityId: string;
  amount: number | null;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toDateNumber(value: string | null): number {
  if (!value) return Number.MIN_SAFE_INTEGER;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Number.MIN_SAFE_INTEGER;
}

function formatDateLabel(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const order = await db.query.orders.findFirst({ where: eq(orders.id, id) });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const [shippingDocRows, allocationRows, invoiceRows, vendorBillRows, logisticsBillRows] =
      await Promise.all([
        db.select().from(shippingDocuments).where(eq(shippingDocuments.orderId, id)),
        db.select().from(containerAllocations).where(eq(containerAllocations.orderId, id)),
        db.select().from(commercialInvoices).where(eq(commercialInvoices.orderId, id)),
        db.select().from(vendorBills).where(eq(vendorBills.orderId, id)),
        db.select().from(logisticsBills).where(eq(logisticsBills.orderId, id)),
      ]);

    const containerIds = new Set<string>();
    for (const row of shippingDocRows) {
      if (row.containerId) containerIds.add(row.containerId);
    }
    for (const row of allocationRows) {
      if (row.containerId) containerIds.add(row.containerId);
    }
    for (const row of logisticsBillRows) {
      if (row.containerId) containerIds.add(row.containerId);
    }

    const containerRows =
      containerIds.size > 0
        ? await db.select().from(containers).where(inArray(containers.id, Array.from(containerIds)))
        : [];
    const containerMap = new Map(containerRows.map((row) => [row.id, row]));

    const invoiceIds = invoiceRows.map((row) => row.id);
    const vendorBillIds = vendorBillRows.map((row) => row.id);
    const logisticsBillIds = logisticsBillRows.map((row) => row.id);

    const [invoicePayments, vendorPayments, logisticsPayments] = await Promise.all([
      invoiceIds.length > 0
        ? db
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.targetType, 'CUSTOMER_INVOICE'),
                inArray(payments.targetId, invoiceIds)
              )
            )
        : Promise.resolve([]),
      vendorBillIds.length > 0
        ? db
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.targetType, 'VENDOR_BILL'),
                inArray(payments.targetId, vendorBillIds)
              )
            )
        : Promise.resolve([]),
      logisticsBillIds.length > 0
        ? db
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.targetType, 'LOGISTICS_BILL'),
                inArray(payments.targetId, logisticsBillIds)
              )
            )
        : Promise.resolve([]),
    ]);

    const targetCode = new Map<string, string>();
    for (const row of invoiceRows) targetCode.set(`CUSTOMER_INVOICE:${row.id}`, row.invoiceNo);
    for (const row of vendorBillRows) targetCode.set(`VENDOR_BILL:${row.id}`, row.billNo);
    for (const row of logisticsBillRows) targetCode.set(`LOGISTICS_BILL:${row.id}`, row.billNo);

    const events: TimelineEvent[] = [];

    events.push({
      id: `ORDER_CREATED:${order.id}`,
      at: toIso(order.createdAt),
      type: 'ORDER_CREATED',
      title: 'Order Created',
      description: `VPO ${order.vpoNumber}`,
      status: order.workflowStatus ?? null,
      entityType: 'ORDER',
      entityId: order.id,
      amount: parseDecimalInput(order.totalAmount, 0),
    });

    if (order.deliveredAt) {
      events.push({
        id: `ORDER_DELIVERED:${order.id}`,
        at: toIso(order.deliveredAt),
        type: 'ORDER_DELIVERED',
        title: 'Order Delivered',
        description: 'Order delivered to customer warehouse.',
        status: 'AR_AP_OPEN',
        entityType: 'ORDER',
        entityId: order.id,
        amount: null,
      });
    }

    if (order.closedAt) {
      events.push({
        id: `ORDER_CLOSED:${order.id}`,
        at: toIso(order.closedAt),
        type: 'ORDER_CLOSED',
        title: 'Order Closed',
        description: 'All AR/AP settlements completed.',
        status: 'CLOSED',
        entityType: 'ORDER',
        entityId: order.id,
        amount: null,
      });
    }

    for (const row of shippingDocRows) {
      const containerNo = row.containerId ? containerMap.get(row.containerId)?.containerNo : null;
      events.push({
        id: `SHIPPING_DOC:${row.id}`,
        at: toIso(row.issueDate ?? row.createdAt),
        type: 'SHIPPING_DOC_ISSUED',
        title: 'Shipping Doc Issued',
        description: containerNo ? `${row.docNo} | ${containerNo}` : row.docNo,
        status: row.status ?? null,
        entityType: 'SHIPPING_DOCUMENT',
        entityId: row.id,
        amount: null,
      });
    }

    for (const row of allocationRows) {
      const containerNo = containerMap.get(row.containerId)?.containerNo ?? row.containerId;
      const qtyLabel = row.allocatedQty ? `Qty ${row.allocatedQty}` : 'Qty -';
      const amountLabel = row.allocatedAmount
        ? `Amount $${parseDecimalInput(row.allocatedAmount, 0).toFixed(2)}`
        : 'Amount -';
      events.push({
        id: `ALLOCATION:${row.id}`,
        at: toIso(row.createdAt),
        type: 'CONTAINER_ALLOCATED',
        title: 'Order Allocated to Container',
        description: `${containerNo} | ${qtyLabel} | ${amountLabel}`,
        status: null,
        entityType: 'CONTAINER_ALLOCATION',
        entityId: row.id,
        amount: parseDecimalInput(row.allocatedAmount, 0),
      });
    }

    for (const row of containerRows) {
      if (row.atd) {
        events.push({
          id: `CONTAINER_ATD:${row.id}`,
          at: toIso(row.atd),
          type: 'CONTAINER_ATD',
          title: 'Container Departed',
          description: row.containerNo,
          status: row.status ?? null,
          entityType: 'CONTAINER',
          entityId: row.id,
          amount: null,
        });
      }
      if (row.ata) {
        events.push({
          id: `CONTAINER_ATA:${row.id}`,
          at: toIso(row.ata),
          type: 'CONTAINER_ATA',
          title: 'Container Arrived Port',
          description: row.containerNo,
          status: row.status ?? null,
          entityType: 'CONTAINER',
          entityId: row.id,
          amount: null,
        });
      }
      if (row.arrivalAtWarehouse) {
        events.push({
          id: `WAREHOUSE_ARRIVAL:${row.id}`,
          at: toIso(row.arrivalAtWarehouse),
          type: 'WAREHOUSE_ARRIVAL',
          title: 'Container Arrived Warehouse',
          description: row.containerNo,
          status: row.status ?? null,
          entityType: 'CONTAINER',
          entityId: row.id,
          amount: null,
        });
      }
    }

    for (const row of invoiceRows) {
      const due = formatDateLabel(row.dueDate);
      events.push({
        id: `AR:${row.id}`,
        at: toIso(row.issueDate ?? row.createdAt),
        type: 'AR_OPENED',
        title: 'Commercial Invoice Opened',
        description: due ? `${row.invoiceNo} | Due ${due}` : row.invoiceNo,
        status: row.status ?? null,
        entityType: 'COMMERCIAL_INVOICE',
        entityId: row.id,
        amount: round2(parseDecimalInput(row.amount, 0)),
      });
    }

    for (const row of vendorBillRows) {
      const due = formatDateLabel(row.dueDate);
      events.push({
        id: `VENDOR_AP:${row.id}`,
        at: toIso(row.issueDate ?? row.createdAt),
        type: 'VENDOR_AP_OPENED',
        title: 'Vendor Bill Opened',
        description: due ? `${row.billNo} | Due ${due}` : row.billNo,
        status: row.status ?? null,
        entityType: 'VENDOR_BILL',
        entityId: row.id,
        amount: round2(parseDecimalInput(row.amount, 0)),
      });
    }

    for (const row of logisticsBillRows) {
      const due = formatDateLabel(row.dueDate);
      events.push({
        id: `LOGISTICS_AP:${row.id}`,
        at: toIso(row.issueDate ?? row.createdAt),
        type: 'LOGISTICS_AP_OPENED',
        title: '3PL Bill Opened',
        description: due ? `${row.billNo} | Due ${due}` : row.billNo,
        status: row.status ?? null,
        entityType: 'LOGISTICS_BILL',
        entityId: row.id,
        amount: round2(parseDecimalInput(row.amount, 0)),
      });
    }

    for (const row of [...invoicePayments, ...vendorPayments, ...logisticsPayments]) {
      const targetLabel = targetCode.get(`${row.targetType}:${row.targetId}`) ?? row.targetId;
      events.push({
        id: `PAYMENT:${row.id}`,
        at: toIso(row.paymentDate ?? row.createdAt),
        type: 'PAYMENT_POSTED',
        title: row.direction === 'IN' ? 'Payment Received' : 'Payment Paid',
        description: `${targetLabel}${row.method ? ` | ${row.method}` : ''}`,
        status: null,
        entityType: 'PAYMENT',
        entityId: row.id,
        amount: round2(parseDecimalInput(row.amount, 0)),
      });
    }

    events.sort((a, b) => {
      const diff = toDateNumber(a.at) - toDateNumber(b.at);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({
      success: true,
      data: {
        orderId: id,
        workflowStatus: order.workflowStatus,
        events,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
