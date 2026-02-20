import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { shippingDocuments } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';
import { shippingDocSchema } from '@/lib/schemas';
import { createShippingDoc } from '@/services/logistics.service';
import { z } from 'zod';

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
        .from(shippingDocuments)
        .where(eq(shippingDocuments.orderId, orderId))
        .orderBy(desc(shippingDocuments.createdAt))
      : await db.select().from(shippingDocuments).orderBy(desc(shippingDocuments.createdAt));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = shippingDocSchema.passthrough().parse(body) as z.infer<typeof shippingDocSchema> & { issueDate?: string | Date | null };
    const saved = await createShippingDoc(data);
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

    const current = await db.query.shippingDocuments.findFirst({
      where: eq(shippingDocuments.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Shipping document not found' }, { status: 404 });
    }

    await db.delete(shippingDocuments).where(eq(shippingDocuments.id, id));
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
      docNo?: string;
      containerId?: string | null;
      issueDate?: string | null;
      status?: string;
      payload?: string | null;
    };

    const current = await db.query.shippingDocuments.findFirst({
      where: eq(shippingDocuments.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Shipping document not found' }, { status: 404 });
    }

    const updateData: Partial<typeof shippingDocuments.$inferInsert> = {};
    if (typeof body.docNo === 'string' && body.docNo.trim()) {
      updateData.docNo = body.docNo.trim();
    }
    if (body.containerId !== undefined) {
      updateData.containerId = body.containerId || null;
    }
    if (body.issueDate !== undefined) {
      updateData.issueDate = body.issueDate ? new Date(body.issueDate) : null;
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      updateData.status = body.status.trim();
    }
    if (body.payload !== undefined) {
      updateData.payload = body.payload || null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [saved] = await db
      .update(shippingDocuments)
      .set(updateData)
      .where(eq(shippingDocuments.id, id))
      .returning();

    await recomputeOrderWorkflowStatus(current.orderId);

    return NextResponse.json({ success: true, data: saved });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
