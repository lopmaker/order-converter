import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { containers, logisticsBills, orders, payments } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { addDays, parseDecimalInput } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function createDefaultCode(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}`;
}

export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get('orderId');
    const containerId = req.nextUrl.searchParams.get('containerId');

    let data;
    if (orderId) {
      data = await db
        .select()
        .from(logisticsBills)
        .where(eq(logisticsBills.orderId, orderId))
        .orderBy(desc(logisticsBills.createdAt));
    } else if (containerId) {
      data = await db
        .select()
        .from(logisticsBills)
        .where(eq(logisticsBills.containerId, containerId))
        .orderBy(desc(logisticsBills.createdAt));
    } else {
      data = await db.select().from(logisticsBills).orderBy(desc(logisticsBills.createdAt));
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      orderId?: string;
      containerId?: string;
      provider?: string;
      billNo?: string;
      amount?: number | string;
      issueDate?: string;
      dueDate?: string;
      currency?: string;
    };

    if (!body.containerId) {
      return NextResponse.json(
        { error: 'containerId is required for 3PL bill (container-based settlement)' },
        { status: 400 }
      );
    }

    const issueDate = body.issueDate ? new Date(body.issueDate) : new Date();

    const order = body.orderId
      ? await db.query.orders.findFirst({ where: eq(orders.id, body.orderId) })
      : null;

    const container = body.containerId
      ? await db.query.containers.findFirst({ where: eq(containers.id, body.containerId) })
      : null;

    const amount = parseDecimalInput(body.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount is required for 3PL bill and must be > 0' },
        { status: 400 }
      );
    }

    const anchor = container?.arrivalAtWarehouse ?? order?.deliveredAt ?? issueDate;
    const termDays = order?.logisticsTermDays ?? 15;
    const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(anchor, termDays);

    const [saved] = await db
      .insert(logisticsBills)
      .values({
        orderId: body.orderId || null,
        containerId: body.containerId || null,
        provider: body.provider || '3PL',
        billNo: body.billNo?.trim() || createDefaultCode('LB'),
        issueDate,
        dueDate,
        amount: amount.toFixed(2),
        currency: body.currency || 'USD',
        status: 'OPEN',
      })
      .returning();

    if (body.orderId) {
      await recomputeOrderWorkflowStatus(body.orderId);
    }

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

    const current = await db.query.logisticsBills.findFirst({
      where: eq(logisticsBills.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: '3PL bill not found' }, { status: 404 });
    }

    const paymentRows = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.targetType, 'LOGISTICS_BILL'), eq(payments.targetId, id)));
    if (paymentRows.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete 3PL bill with payments. Delete related payments first.' },
        { status: 409 }
      );
    }

    await db.delete(logisticsBills).where(eq(logisticsBills.id, id));
    if (current.orderId) {
      await recomputeOrderWorkflowStatus(current.orderId);
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
      billNo?: string;
      containerId?: string | null;
      provider?: string | null;
      issueDate?: string | null;
      dueDate?: string | null;
      amount?: number | string;
      currency?: string;
      status?: string;
    };

    const current = await db.query.logisticsBills.findFirst({
      where: eq(logisticsBills.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: '3PL bill not found' }, { status: 404 });
    }

    const updateData: Partial<typeof logisticsBills.$inferInsert> = {};
    if (typeof body.billNo === 'string' && body.billNo.trim()) {
      updateData.billNo = body.billNo.trim();
    }
    if (body.containerId !== undefined) {
      updateData.containerId = body.containerId || null;
    }
    if (body.provider !== undefined) {
      updateData.provider = body.provider || null;
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
      .update(logisticsBills)
      .set(updateData)
      .where(eq(logisticsBills.id, id))
      .returning();

    if (current.orderId) {
      await recomputeOrderWorkflowStatus(current.orderId);
    }

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
