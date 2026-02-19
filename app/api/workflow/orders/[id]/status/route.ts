import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { getErrorMessage } from '@/lib/api-helpers';
import { eq } from 'drizzle-orm';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      deliveredAt?: string;
      customerTermDays?: number;
      vendorTermDays?: number;
      logisticsTermDays?: number;
    };

    if (!body.status?.trim()) {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const [updated] = await db
      .update(orders)
      .set({
        workflowStatus: body.status.trim(),
        deliveredAt: body.deliveredAt
          ? new Date(body.deliveredAt)
          : body.status === 'DELIVERED'
            ? new Date()
            : undefined,
        customerTermDays:
          typeof body.customerTermDays === 'number' ? body.customerTermDays : undefined,
        vendorTermDays: typeof body.vendorTermDays === 'number' ? body.vendorTermDays : undefined,
        logisticsTermDays:
          typeof body.logisticsTermDays === 'number' ? body.logisticsTermDays : undefined,
      })
      .where(eq(orders.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
