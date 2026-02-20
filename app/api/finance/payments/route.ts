import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { commercialInvoices, logisticsBills, payments, vendorBills } from '@/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { parseDecimalInput } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import { paymentSchema } from '@/lib/schemas';
import { createPayment, refreshBillStatus, PaymentTargetType } from '@/services/finance.service';
import { z } from 'zod';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function resolveTargetType(value: unknown): PaymentTargetType | null {
  if (value === 'CUSTOMER_INVOICE' || value === 'VENDOR_BILL' || value === 'LOGISTICS_BILL') {
    return value;
  }
  return null;
}


export async function GET(req: NextRequest) {
  try {
    const targetType = req.nextUrl.searchParams.get('targetType');
    const targetId = req.nextUrl.searchParams.get('targetId');
    const orderId = req.nextUrl.searchParams.get('orderId');

    if (targetType && targetId) {
      const data = await db
        .select()
        .from(payments)
        .where(and(eq(payments.targetType, targetType), eq(payments.targetId, targetId)))
        .orderBy(desc(payments.paymentDate), desc(payments.createdAt));
      return NextResponse.json({ success: true, data });
    }

    if (orderId) {
      const [invoiceRows, vendorRows, logisticsRows] = await Promise.all([
        db
          .select({ id: commercialInvoices.id, code: commercialInvoices.invoiceNo })
          .from(commercialInvoices)
          .where(eq(commercialInvoices.orderId, orderId)),
        db
          .select({ id: vendorBills.id, code: vendorBills.billNo })
          .from(vendorBills)
          .where(eq(vendorBills.orderId, orderId)),
        db
          .select({ id: logisticsBills.id, code: logisticsBills.billNo })
          .from(logisticsBills)
          .where(eq(logisticsBills.orderId, orderId)),
      ]);

      const invoiceIds = invoiceRows.map((row) => row.id);
      const vendorIds = vendorRows.map((row) => row.id);
      const logisticsIds = logisticsRows.map((row) => row.id);

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
        vendorIds.length > 0
          ? db
            .select()
            .from(payments)
            .where(
              and(eq(payments.targetType, 'VENDOR_BILL'), inArray(payments.targetId, vendorIds))
            )
          : Promise.resolve([]),
        logisticsIds.length > 0
          ? db
            .select()
            .from(payments)
            .where(
              and(
                eq(payments.targetType, 'LOGISTICS_BILL'),
                inArray(payments.targetId, logisticsIds)
              )
            )
          : Promise.resolve([]),
      ]);

      const codeMap = new Map<string, string>();
      for (const row of invoiceRows) codeMap.set(`CUSTOMER_INVOICE:${row.id}`, row.code);
      for (const row of vendorRows) codeMap.set(`VENDOR_BILL:${row.id}`, row.code);
      for (const row of logisticsRows) codeMap.set(`LOGISTICS_BILL:${row.id}`, row.code);

      const merged = [...invoicePayments, ...vendorPayments, ...logisticsPayments]
        .sort((a, b) => {
          const da = new Date(a.paymentDate ?? a.createdAt ?? 0).getTime();
          const dbDate = new Date(b.paymentDate ?? b.createdAt ?? 0).getTime();
          return dbDate - da;
        })
        .map((row) => ({
          ...row,
          targetCode: codeMap.get(`${row.targetType}:${row.targetId}`) ?? row.targetId,
        }));

      return NextResponse.json({ success: true, data: merged });
    }

    const data = await db
      .select()
      .from(payments)
      .orderBy(desc(payments.paymentDate), desc(payments.createdAt));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = paymentSchema.parse(body);
    const saved = await createPayment(data);
    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const current = await db.query.payments.findFirst({
      where: eq(payments.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    await db.delete(payments).where(eq(payments.id, id));

    const targetType = resolveTargetType(current.targetType);
    if (targetType) {
      const orderId = await refreshBillStatus(targetType, current.targetId);
      if (orderId) {
        await recomputeOrderWorkflowStatus(orderId);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const body = (await req.json()) as {
      amount?: number | string;
      paymentDate?: string | null;
      direction?: 'IN' | 'OUT';
      method?: string | null;
      referenceNo?: string | null;
      notes?: string | null;
    };

    const current = await db.query.payments.findFirst({
      where: eq(payments.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const updateData: Partial<typeof payments.$inferInsert> = {};
    if (body.amount !== undefined) {
      const amount = parseDecimalInput(body.amount, NaN);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
      }
      updateData.amount = amount.toFixed(2);
    }
    if (body.paymentDate !== undefined) {
      updateData.paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;
    }
    if (body.direction === 'IN' || body.direction === 'OUT') {
      updateData.direction = body.direction;
    }
    if (body.method !== undefined) {
      updateData.method = body.method || null;
    }
    if (body.referenceNo !== undefined) {
      updateData.referenceNo = body.referenceNo || null;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [saved] = await db
      .update(payments)
      .set(updateData)
      .where(eq(payments.id, id))
      .returning();

    const targetType = resolveTargetType(current.targetType);
    if (targetType) {
      const orderId = await refreshBillStatus(targetType, current.targetId);
      if (orderId) {
        await recomputeOrderWorkflowStatus(orderId);
      }
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
