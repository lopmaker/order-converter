import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { logisticsBills, orders, payments, vendorBills } from '@/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { parseDecimalInput, round2 } from '@/lib/finance-math';
import { getErrorMessage } from '@/lib/api-helpers';

type PayScheduleItem = {
  id: string;
  orderId: string | null;
  vpoNumber: string | null;
  type: 'VENDOR_BILL' | 'LOGISTICS_BILL';
  billNo: string;
  provider: string | null; // only for logistics
  issueDate: string | null;
  dueDate: string | null;
  amount: number;
  paid: number;
  outstanding: number;
  status: string;
  currency: string;
};

async function sumPaidForBills(
  targetType: 'VENDOR_BILL' | 'LOGISTICS_BILL',
  billIds: string[]
): Promise<Map<string, number>> {
  if (billIds.length === 0) return new Map();
  const rows = await db
    .select({ targetId: payments.targetId, amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.targetType, targetType), inArray(payments.targetId, billIds)));

  const totals = new Map<string, number>();
  for (const row of rows) {
    const prev = totals.get(row.targetId) ?? 0;
    totals.set(row.targetId, prev + parseDecimalInput(row.amount, 0));
  }
  return totals;
}

/**
 * GET /api/finance/pay-schedule
 *
 * Returns the "资金计划表" — upcoming factory (vendor) and 3PL (logistics) payments
 * sorted by dueDate. Each bill's dueDate was computed from the shipment date plus
 * the relevant term days when the bill was created; this endpoint just aggregates
 * and exposes that view so you can see what you owe and when.
 *
 * Optional query params:
 *   ?orderId=<uuid>     — filter to a single VPO
 */
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');

    const vendorBillRows = orderId
      ? await db
          .select({
            id: vendorBills.id,
            orderId: vendorBills.orderId,
            billNo: vendorBills.billNo,
            issueDate: vendorBills.issueDate,
            dueDate: vendorBills.dueDate,
            amount: vendorBills.amount,
            status: vendorBills.status,
            currency: vendorBills.currency,
            vpoNumber: orders.vpoNumber,
          })
          .from(vendorBills)
          .leftJoin(orders, eq(vendorBills.orderId, orders.id))
          .where(eq(vendorBills.orderId, orderId))
          .orderBy(asc(vendorBills.dueDate))
      : await db
          .select({
            id: vendorBills.id,
            orderId: vendorBills.orderId,
            billNo: vendorBills.billNo,
            issueDate: vendorBills.issueDate,
            dueDate: vendorBills.dueDate,
            amount: vendorBills.amount,
            status: vendorBills.status,
            currency: vendorBills.currency,
            vpoNumber: orders.vpoNumber,
          })
          .from(vendorBills)
          .leftJoin(orders, eq(vendorBills.orderId, orders.id))
          .orderBy(asc(vendorBills.dueDate));

    const logisticsBillRows = orderId
      ? await db
          .select({
            id: logisticsBills.id,
            orderId: logisticsBills.orderId,
            billNo: logisticsBills.billNo,
            provider: logisticsBills.provider,
            issueDate: logisticsBills.issueDate,
            dueDate: logisticsBills.dueDate,
            amount: logisticsBills.amount,
            status: logisticsBills.status,
            currency: logisticsBills.currency,
            vpoNumber: orders.vpoNumber,
          })
          .from(logisticsBills)
          .leftJoin(orders, eq(logisticsBills.orderId, orders.id))
          .where(eq(logisticsBills.orderId, orderId))
          .orderBy(asc(logisticsBills.dueDate))
      : await db
          .select({
            id: logisticsBills.id,
            orderId: logisticsBills.orderId,
            billNo: logisticsBills.billNo,
            provider: logisticsBills.provider,
            issueDate: logisticsBills.issueDate,
            dueDate: logisticsBills.dueDate,
            amount: logisticsBills.amount,
            status: logisticsBills.status,
            currency: logisticsBills.currency,
            vpoNumber: orders.vpoNumber,
          })
          .from(logisticsBills)
          .leftJoin(orders, eq(logisticsBills.orderId, orders.id))
          .orderBy(asc(logisticsBills.dueDate));

    const vendorPaidMap = await sumPaidForBills(
      'VENDOR_BILL',
      vendorBillRows.map((r) => r.id)
    );
    const logisticsPaidMap = await sumPaidForBills(
      'LOGISTICS_BILL',
      logisticsBillRows.map((r) => r.id)
    );

    const items: PayScheduleItem[] = [
      ...vendorBillRows.map((row) => {
        const amount = round2(parseDecimalInput(row.amount, 0));
        const paid = round2(vendorPaidMap.get(row.id) ?? 0);
        return {
          id: row.id,
          orderId: row.orderId,
          vpoNumber: row.vpoNumber,
          type: 'VENDOR_BILL' as const,
          billNo: row.billNo,
          provider: null,
          issueDate: row.issueDate ? new Date(row.issueDate).toISOString() : null,
          dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
          amount,
          paid,
          outstanding: round2(Math.max(0, amount - paid)),
          status: row.status ?? 'OPEN',
          currency: row.currency ?? 'USD',
        };
      }),
      ...logisticsBillRows.map((row) => {
        const amount = round2(parseDecimalInput(row.amount, 0));
        const paid = round2(logisticsPaidMap.get(row.id) ?? 0);
        return {
          id: row.id,
          orderId: row.orderId,
          vpoNumber: row.vpoNumber,
          type: 'LOGISTICS_BILL' as const,
          billNo: row.billNo,
          provider: row.provider,
          issueDate: row.issueDate ? new Date(row.issueDate).toISOString() : null,
          dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
          amount,
          paid,
          outstanding: round2(Math.max(0, amount - paid)),
          status: row.status ?? 'OPEN',
          currency: row.currency ?? 'USD',
        };
      }),
    ].sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dbDate = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return da - dbDate;
    });

    const totals = {
      totalAmount: round2(items.reduce((sum, x) => sum + x.amount, 0)),
      totalPaid: round2(items.reduce((sum, x) => sum + x.paid, 0)),
      totalOutstanding: round2(items.reduce((sum, x) => sum + x.outstanding, 0)),
      vendorOutstanding: round2(
        items
          .filter((x) => x.type === 'VENDOR_BILL')
          .reduce((sum, x) => sum + x.outstanding, 0)
      ),
      logisticsOutstanding: round2(
        items
          .filter((x) => x.type === 'LOGISTICS_BILL')
          .reduce((sum, x) => sum + x.outstanding, 0)
      ),
    };

    return NextResponse.json({ success: true, data: { items, totals } });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
