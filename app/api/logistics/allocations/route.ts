import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { containerAllocations } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { parseDecimalInput } from '@/lib/workflow';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(req: NextRequest) {
  try {
    const containerId = req.nextUrl.searchParams.get('containerId');
    const orderId = req.nextUrl.searchParams.get('orderId');

    let data;
    if (containerId && orderId) {
      data = await db
        .select()
        .from(containerAllocations)
        .where(
          and(
            eq(containerAllocations.containerId, containerId),
            eq(containerAllocations.orderId, orderId)
          )
        )
        .orderBy(desc(containerAllocations.createdAt));
    } else if (containerId) {
      data = await db
        .select()
        .from(containerAllocations)
        .where(eq(containerAllocations.containerId, containerId))
        .orderBy(desc(containerAllocations.createdAt));
    } else if (orderId) {
      data = await db
        .select()
        .from(containerAllocations)
        .where(eq(containerAllocations.orderId, orderId))
        .orderBy(desc(containerAllocations.createdAt));
    } else {
      data = await db
        .select()
        .from(containerAllocations)
        .orderBy(desc(containerAllocations.createdAt));
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      containerId?: string;
      orderId?: string;
      orderItemId?: string;
      allocatedQty?: number | string;
      allocatedAmount?: number | string;
      notes?: string;
    };

    if (!body.containerId || !body.orderId) {
      return NextResponse.json({ error: 'containerId and orderId are required' }, { status: 400 });
    }

    const [saved] = await db
      .insert(containerAllocations)
      .values({
        containerId: body.containerId,
        orderId: body.orderId,
        orderItemId: body.orderItemId || null,
        allocatedQty:
          body.allocatedQty !== undefined
            ? Math.max(0, Math.round(parseDecimalInput(body.allocatedQty, 0)))
            : null,
        allocatedAmount:
          body.allocatedAmount !== undefined
            ? parseDecimalInput(body.allocatedAmount, 0).toFixed(2)
            : null,
        notes: body.notes || null,
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

    const current = await db.query.containerAllocations.findFirst({
      where: eq(containerAllocations.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });
    }

    await db.delete(containerAllocations).where(eq(containerAllocations.id, id));
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
      containerId?: string;
      orderItemId?: string | null;
      allocatedQty?: number | string | null;
      allocatedAmount?: number | string | null;
      notes?: string | null;
    };

    const current = await db.query.containerAllocations.findFirst({
      where: eq(containerAllocations.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Allocation not found' }, { status: 404 });
    }

    const updateData: Partial<typeof containerAllocations.$inferInsert> = {};
    if (typeof body.containerId === 'string' && body.containerId.trim()) {
      updateData.containerId = body.containerId.trim();
    }
    if (body.orderItemId !== undefined) {
      updateData.orderItemId = body.orderItemId || null;
    }
    if (body.allocatedQty !== undefined) {
      if (body.allocatedQty === null || body.allocatedQty === '') {
        updateData.allocatedQty = null;
      } else {
        updateData.allocatedQty = Math.max(0, Math.round(parseDecimalInput(body.allocatedQty, 0)));
      }
    }
    if (body.allocatedAmount !== undefined) {
      if (body.allocatedAmount === null || body.allocatedAmount === '') {
        updateData.allocatedAmount = null;
      } else {
        updateData.allocatedAmount = parseDecimalInput(body.allocatedAmount, 0).toFixed(2);
      }
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [saved] = await db
      .update(containerAllocations)
      .set(updateData)
      .where(eq(containerAllocations.id, id))
      .returning();

    await recomputeOrderWorkflowStatus(current.orderId);

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
