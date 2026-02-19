import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { containerAllocations, containers, logisticsBills, shippingDocuments } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { recomputeOrderWorkflowStatus } from '@/lib/workflow-status';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status');
    const data = status
      ? await db
          .select()
          .from(containers)
          .where(eq(containers.status, status))
          .orderBy(desc(containers.createdAt))
      : await db.select().from(containers).orderBy(desc(containers.createdAt));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      containerNo?: string;
      vesselName?: string;
      status?: string;
      etd?: string;
      eta?: string;
      atd?: string;
      ata?: string;
      arrivalAtWarehouse?: string;
    };

    if (!body.containerNo?.trim()) {
      return NextResponse.json({ error: 'containerNo is required' }, { status: 400 });
    }

    const [saved] = await db
      .insert(containers)
      .values({
        containerNo: body.containerNo.trim(),
        vesselName: body.vesselName?.trim() || null,
        status: body.status || 'PLANNED',
        etd: body.etd ? new Date(body.etd) : null,
        eta: body.eta ? new Date(body.eta) : null,
        atd: body.atd ? new Date(body.atd) : null,
        ata: body.ata ? new Date(body.ata) : null,
        arrivalAtWarehouse: body.arrivalAtWarehouse ? new Date(body.arrivalAtWarehouse) : null,
      })
      .returning();

    return NextResponse.json({ success: true, data: saved });
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
      containerNo?: string;
      vesselName?: string | null;
      status?: string;
      etd?: string | null;
      eta?: string | null;
      atd?: string | null;
      ata?: string | null;
      arrivalAtWarehouse?: string | null;
    };

    const current = await db.query.containers.findFirst({
      where: eq(containers.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Container not found' }, { status: 404 });
    }

    const updateData: Partial<typeof containers.$inferInsert> = {};
    if (typeof body.containerNo === 'string' && body.containerNo.trim()) {
      updateData.containerNo = body.containerNo.trim();
    }
    if (body.vesselName !== undefined) {
      updateData.vesselName = body.vesselName || null;
    }
    if (typeof body.status === 'string' && body.status.trim()) {
      updateData.status = body.status.trim().toUpperCase();
    }
    if (body.etd !== undefined) {
      updateData.etd = body.etd ? new Date(body.etd) : null;
    }
    if (body.eta !== undefined) {
      updateData.eta = body.eta ? new Date(body.eta) : null;
    }
    if (body.atd !== undefined) {
      updateData.atd = body.atd ? new Date(body.atd) : null;
    }
    if (body.ata !== undefined) {
      updateData.ata = body.ata ? new Date(body.ata) : null;
    }
    if (body.arrivalAtWarehouse !== undefined) {
      updateData.arrivalAtWarehouse = body.arrivalAtWarehouse
        ? new Date(body.arrivalAtWarehouse)
        : null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const [saved] = await db
      .update(containers)
      .set(updateData)
      .where(eq(containers.id, id))
      .returning();

    const affectedAllocations = await db
      .select({ orderId: containerAllocations.orderId })
      .from(containerAllocations)
      .where(eq(containerAllocations.containerId, id));
    const affectedShippingDocs = await db
      .select({ orderId: shippingDocuments.orderId })
      .from(shippingDocuments)
      .where(eq(shippingDocuments.containerId, id));
    const affectedLogisticsBills = await db
      .select({ orderId: logisticsBills.orderId })
      .from(logisticsBills)
      .where(eq(logisticsBills.containerId, id));

    const orderIds = Array.from(
      new Set(
        [...affectedAllocations, ...affectedShippingDocs, ...affectedLogisticsBills]
          .map((x) => x.orderId)
          .filter((x): x is string => !!x)
      )
    );
    await Promise.all(orderIds.map((orderId) => recomputeOrderWorkflowStatus(orderId)));

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

    const current = await db.query.containers.findFirst({
      where: eq(containers.id, id),
    });
    if (!current) {
      return NextResponse.json({ error: 'Container not found' }, { status: 404 });
    }

    const affectedAllocations = await db
      .select({ orderId: containerAllocations.orderId })
      .from(containerAllocations)
      .where(eq(containerAllocations.containerId, id));
    const affectedShippingDocs = await db
      .select({ orderId: shippingDocuments.orderId })
      .from(shippingDocuments)
      .where(eq(shippingDocuments.containerId, id));
    const affectedLogisticsBills = await db
      .select({ orderId: logisticsBills.orderId })
      .from(logisticsBills)
      .where(eq(logisticsBills.containerId, id));

    await db.delete(containers).where(eq(containers.id, id));

    const orderIds = Array.from(
      new Set(
        [...affectedAllocations, ...affectedShippingDocs, ...affectedLogisticsBills]
          .map((x) => x.orderId)
          .filter((x): x is string => !!x)
      )
    );
    await Promise.all(orderIds.map((orderId) => recomputeOrderWorkflowStatus(orderId)));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
