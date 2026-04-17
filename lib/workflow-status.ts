import { db } from '@/db';
import {
  commercialInvoices,
  containerAllocations,
  logisticsBills,
  orders,
  productionLots,
  shippingDocuments,
  vendorBills,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { deriveStage, type StageContext } from './workflow-stages';

function normalizeStatus(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase();
}

/**
 * Recompute the VPO's workflow stage from its current data.
 * Call this after any mutation that could advance the stage
 * (new production lot, container allocation, invoice, payment, delivery, etc).
 */
export async function recomputeOrderWorkflowStatus(orderId: string) {
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return null;

  const [
    productionLotRows,
    shippingDocRows,
    allocationRows,
    invoiceRows,
    vendorBillRows,
    logisticsBillRows,
  ] = await Promise.all([
    db
      .select({ id: productionLots.id })
      .from(productionLots)
      .where(eq(productionLots.orderId, orderId)),
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

  const financeStatuses = [...invoiceRows, ...vendorBillRows, ...logisticsBillRows].map((row) =>
    normalizeStatus(row.status)
  );
  const hasFinanceDocs = financeStatuses.length > 0;
  const allFinancePaid = hasFinanceDocs && financeStatuses.every((status) => status === 'PAID');

  const ctx: StageContext = {
    hasProductionLots: productionLotRows.length > 0,
    hasContainerAllocations: allocationRows.length > 0,
    hasShippingDocs: shippingDocRows.length > 0,
    hasCommercialInvoices: invoiceRows.length > 0,
    hasFinanceDocs,
    allFinanceDocsPaid: allFinancePaid,
    deliveredAt: order.deliveredAt,
  };

  const nextStage = deriveStage(ctx);
  const nextClosedAt = nextStage === 'CLOSED' ? (order.closedAt ?? new Date()) : null;

  const [updated] = await db
    .update(orders)
    .set({
      workflowStatus: nextStage,
      closedAt: nextClosedAt,
    })
    .where(eq(orders.id, orderId))
    .returning();

  return updated;
}
