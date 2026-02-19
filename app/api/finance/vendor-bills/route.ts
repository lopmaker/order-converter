import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orderItems, orders, payments, vendorBills } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { addDays, parseDecimalInput, round2 } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function createDefaultCode(prefix: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 14);
  return `${prefix}-${stamp}`;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');
    const data = orderId
      ? await db
          .select()
          .from(vendorBills)
          .where(eq(vendorBills.orderId, orderId))
          .orderBy(desc(vendorBills.createdAt))
      : await db.select().from(vendorBills).orderBy(desc(vendorBills.createdAt));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderId?: string;
      billNo?: string;
      amount?: number | string;
      issueDate?: string;
      dueDate?: string;
      currency?: string;
    };

    if (!body.orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const order = await db.query.orders.findFirst({ where: eq(orders.id, body.orderId) });
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();
    let amount = parseDecimalInput(body.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      const items = await db
        .select({
          qty: orderItems.quantity,
          vendorUnitPrice: orderItems.vendorUnitPrice,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, body.orderId));
      amount = round2(
        items.reduce(
          (sum, item) =>
            sum + parseDecimalInput(item.qty, 0) * parseDecimalInput(item.vendorUnitPrice, 0),
          0
        )
      );
    }
    const dueDate = body.dueDate
      ? new Date(body.dueDate)
      : addDays(issueDate, order.vendorTermDays ?? 30);

    const [saved] = await db
      .insert(vendorBills)
      .values({
        orderId: body.orderId,
        billNo: body.billNo?.trim() || createDefaultCode('VB'),
        issueDate,
        dueDate,
        amount: amount.toFixed(2),
        currency: body.currency || 'USD',
        status: 'OPEN',
      })
      .returning();

    await recomputeOrderWorkflowStatus(body.orderId);

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const current = await db.query.vendorBills.findFirst({
      where: eq(vendorBills.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Vendor bill not found' }, { status: 404 });
    }

    const paymentRows = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.targetType, 'VENDOR_BILL'), eq(payments.targetId, id)));
    if (paymentRows.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete vendor bill with payments. Delete related payments first.' },
        { status: 409 }
      );
    }

    await db.delete(vendorBills).where(eq(vendorBills.id, id));
    await recomputeOrderWorkflowStatus(current.orderId);

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
      billNo?: string;
      issueDate?: string | null;
      dueDate?: string | null;
      amount?: number | string;
      currency?: string;
      status?: string;
    };

    const current = await db.query.vendorBills.findFirst({
      where: eq(vendorBills.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Vendor bill not found' }, { status: 404 });
    }

    const updateData: Partial<typeof vendorBills.$inferInsert> = {};
    if (typeof body.billNo === 'string' && body.billNo.trim()) {
      updateData.billNo = body.billNo.trim();
    }
    if (body.issueDate !== undefined) {
      updateData.issueDate = body.issueDate ? new Date(body.issueDate) : null;
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.amount !== undefined) {
      const amount = parseDecimalInput(body.amount, NaN);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: 'amount must be a valid number' }, { status: 400 });
      }
      updateData.amount = amount.toFixed(2);
    }
    if (typeof body.currency === 'string' && body.currency.trim()) {
      updateData.currency = body.currency.trim().toUpperCase();
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      updateData.status = body.status.trim().toUpperCase();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [saved] = await db
      .update(vendorBills)
      .set(updateData)
      .where(eq(vendorBills.id, id))
      .returning();

    await recomputeOrderWorkflowStatus(current.orderId);

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
