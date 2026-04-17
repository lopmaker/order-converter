import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tariffRates } from '@/db/schema';
import { asc, eq } from 'drizzle-orm';
import { defaultTariffRateByTariffKey, normalizeTariffKey } from '@/lib/tariffs';
import { parseDecimalInput, round4 } from '@/lib/workflow';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

const REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function GET() {
  try {
    const rows = await db.select().from(tariffRates).orderBy(asc(tariffRates.productClass));

    // ── Auto-refresh: if any auto-synced row is older than 30 days, recompute all ──
    const now = Date.now();
    const needsRefresh = rows.some(
      (row) =>
        row.source === 'sync' &&
        row.updatedAt &&
        now - new Date(row.updatedAt).getTime() > REFRESH_INTERVAL_MS
    );

    if (needsRefresh) {
      const autoSynced = rows.filter((r) => r.source === 'sync');
      await Promise.all(
        autoSynced.map((row) => {
          const newRate = round4(defaultTariffRateByTariffKey(normalizeTariffKey(row.productClass)));
          return db
            .update(tariffRates)
            .set({ tariffRate: newRate.toFixed(4), updatedAt: new Date() })
            .where(eq(tariffRates.id, row.id));
        })
      );
      // Re-fetch fresh data after update
      const refreshed = await db.select().from(tariffRates).orderBy(asc(tariffRates.productClass));
      return NextResponse.json({
        success: true,
        autoRefreshed: true,
        data: refreshed.map((row) => ({
          ...row,
          tariffKey: row.productClass,
          tariffRate: Number(row.tariffRate || 0),
        })),
      });
    }

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        tariffKey: row.productClass,
        tariffRate: Number(row.tariffRate || 0),
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      tariffKey?: string;
      productClass?: string;
      tariffRate?: number | string;
      notes?: string;
    };

    const tariffKey = body.tariffKey?.trim() || body.productClass?.trim();
    if (!tariffKey) {
      return NextResponse.json({ error: 'tariffKey is required' }, { status: 400 });
    }

    const normalizedClass = normalizeTariffKey(tariffKey);
    const rate = Math.max(
      0,
      parseDecimalInput(body.tariffRate, defaultTariffRateByTariffKey(normalizedClass))
    );

    const [saved] = await db
      .insert(tariffRates)
      .values({
        productClass: normalizedClass,
        tariffRate: round4(rate).toFixed(4),
        source: 'manual',
        notes: body.notes,
      })
      .onConflictDoUpdate({
        target: tariffRates.productClass,
        set: {
          tariffRate: round4(rate).toFixed(4),
          source: 'manual',
          notes: body.notes,
          updatedAt: new Date(),
        },
      })
      .returning();

    return NextResponse.json({
      success: true,
      data: {
        ...saved,
        tariffKey: saved.productClass,
        tariffRate: Number(saved.tariffRate || 0),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
