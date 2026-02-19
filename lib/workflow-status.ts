import { db } from '@/db';
import {
  commercialInvoices,
  containerAllocations,
  logisticsBills,
  orders,
  shippingDocuments,
  vendorBills,
} from '@/db/schema';
import { eq } from 'drizzle-orm';

function normalizeStatus(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase();
}

/**
 * Recalculate order workflow status by existing logistics + finance documents.
 * This keeps workflow consistent after manual changes (delete/re-create/fix).
 */
export async function recomputeOrderWorkflowStatus(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return null;

  const [shippingDocRows, allocationRows, invoiceRows, vendorBillRows, logisticsBillRows] =
    await Promise.all([
      db
        .select({ id: shippingDocuments.id })
        .from(shippingDocuments)
        .where(eq(shippingDocuments.orderId, orderId)),
      db
        .select({ id: containerAllocations.id })
        .from(containerAllocations)
        .where(eq(containerAllocations.orderId, orderId)),
      db
        .select({ status: commercialInvoices.status })
        .from(commercialInvoices)
        .where(eq(commercialInvoices.orderId, orderId)),
      db
        .select({ status: vendorBills.status })
        .from(vendorBills)
        .where(eq(vendorBills.orderId, orderId)),
      db
        .select({ status: logisticsBills.status })
        .from(logisticsBills)
        .where(eq(logisticsBills.orderId, orderId)),
    ]);

  const hasShippingDocs = shippingDocRows.length > 0;
  const hasAllocations = allocationRows.length > 0;
  const hasInvoices = invoiceRows.length > 0;
  const hasVendorBills = vendorBillRows.length > 0;
  const hasLogisticsBills = logisticsBillRows.length > 0;

  const financeStatuses = [...invoiceRows, ...vendorBillRows, ...logisticsBillRows].map((row) =>
    normalizeStatus(row.status)
  );
  const hasFinanceDocs = financeStatuses.length > 0;
  const allFinancePaid = hasFinanceDocs && financeStatuses.every((status) => status === 'PAID');

  let nextWorkflowStatus: string;
  let nextClosedAt: Date | null = null;

  if (order.deliveredAt) {
    if (allFinancePaid) {
      nextWorkflowStatus = 'CLOSED';
      nextClosedAt = order.closedAt ?? new Date();
    } else if (hasFinanceDocs) {
      nextWorkflowStatus = 'AR_AP_OPEN';
    } else if (hasShippingDocs || hasAllocations) {
      nextWorkflowStatus = 'IN_TRANSIT';
    } else {
      nextWorkflowStatus = 'PO_UPLOADED';
    }
  } else if (hasInvoices || hasVendorBills || hasLogisticsBills) {
    nextWorkflowStatus = 'IN_TRANSIT';
  } else if (hasShippingDocs) {
    nextWorkflowStatus = 'SHIPPING_DOC_SENT';
  } else if (hasAllocations) {
    nextWorkflowStatus = 'PARTIALLY_SHIPPED';
  } else {
    nextWorkflowStatus = 'PO_UPLOADED';
  }

  const [updated] = await db
    .update(orders)
    .set({
      workflowStatus: nextWorkflowStatus,
      closedAt: nextClosedAt,
    })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
}
