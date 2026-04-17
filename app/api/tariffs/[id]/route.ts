import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tariffRates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { parseDecimalInput, round4 } from '@/lib/workflow';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { tariffRate?: number | string; notes?: string };

    const rate = parseDecimalInput(body.tariffRate, NaN);
    if (!Number.isFinite(rate)) {
      return NextResponse.json({ error: 'tariffRate is required' }, { status: 400 });
    }

    const [updated] = await db
      .update(tariffRates)
      .set({
        tariffRate: round4(Math.max(0, rate)).toFixed(4),
        notes: body.notes,
        source: 'manual',
        updatedAt: new Date(),
      })
      .where(eq(tariffRates.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Tariff row not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        tariffKey: updated.productClass,
        tariffRate: Number(updated.tariffRate || 0),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
