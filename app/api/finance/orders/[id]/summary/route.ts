import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  commercialInvoices,
  logisticsBills,
  payments,
  vendorBills,
} from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { parseDecimalInput, round2 } from '@/lib/workflow';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

type RouteContext = { params: Promise<{ id: string }> };

async function paidAmount(targetType: string, targetId: string) {
  const rows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.targetType, targetType), eq(payments.targetId, targetId)));
  return round2(rows.reduce((sum, row) => sum + parseDecimalInput(row.amount, 0), 0));
}

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    const [invoices, vendor, logistics] = await Promise.all([
      db.select().from(commercialInvoices).where(eq(commercialInvoices.orderId, id)),
      db.select().from(vendorBills).where(eq(vendorBills.orderId, id)),
      db.select().from(logisticsBills).where(eq(logisticsBills.orderId, id)),
    ]);

    const invoiceSummaries = await Promise.all(
      invoices.map(async (doc) => {
        const paid = await paidAmount('CUSTOMER_INVOICE', doc.id);
        const amount = parseDecimalInput(doc.amount, 0);
        return {
          id: doc.id,
          code: doc.invoiceNo,
          amount,
          paid,
          outstanding: round2(Math.max(0, amount - paid)),
          dueDate: doc.dueDate,
          status: doc.status,
        };
      })
    );

    const vendorSummaries = await Promise.all(
      vendor.map(async (doc) => {
        const paid = await paidAmount('VENDOR_BILL', doc.id);
        const amount = parseDecimalInput(doc.amount, 0);
        return {
          id: doc.id,
          code: doc.billNo,
          amount,
          paid,
          outstanding: round2(Math.max(0, amount - paid)),
          dueDate: doc.dueDate,
          status: doc.status,
        };
      })
    );

    const logisticsSummaries = await Promise.all(
      logistics.map(async (doc) => {
        const paid = await paidAmount('LOGISTICS_BILL', doc.id);
        const amount = parseDecimalInput(doc.amount, 0);
        return {
          id: doc.id,
          code: doc.billNo,
          amount,
          paid,
          outstanding: round2(Math.max(0, amount - paid)),
          dueDate: doc.dueDate,
          status: doc.status,
        };
      })
    );

    const totals = {
      receivable: round2(invoiceSummaries.reduce((sum, x) => sum + x.amount, 0)),
      receivablePaid: round2(invoiceSummaries.reduce((sum, x) => sum + x.paid, 0)),
      receivableOutstanding: round2(invoiceSummaries.reduce((sum, x) => sum + x.outstanding, 0)),
      vendorPayable: round2(vendorSummaries.reduce((sum, x) => sum + x.amount, 0)),
      vendorPaid: round2(vendorSummaries.reduce((sum, x) => sum + x.paid, 0)),
      vendorOutstanding: round2(vendorSummaries.reduce((sum, x) => sum + x.outstanding, 0)),
      logisticsPayable: round2(logisticsSummaries.reduce((sum, x) => sum + x.amount, 0)),
      logisticsPaid: round2(logisticsSummaries.reduce((sum, x) => sum + x.paid, 0)),
      logisticsOutstanding: round2(logisticsSummaries.reduce((sum, x) => sum + x.outstanding, 0)),
    };

    return NextResponse.json({
      success: true,
      data: {
        invoices: invoiceSummaries,
        vendorBills: vendorSummaries,
        logisticsBills: logisticsSummaries,
        totals,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
