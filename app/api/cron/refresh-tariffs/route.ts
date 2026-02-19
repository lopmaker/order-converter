/**
 * GET /api/cron/refresh-tariffs
 *
 * Monthly tariff rate refresh endpoint.
 * Recomputes all auto-synced rows using the latest HTS base rates + surcharges in lib/tariffs.ts.
 * Manual edits (source !== 'sync') are preserved.
 *
 * Protect with CRON_SECRET env var — pass as Authorization: Bearer <secret>
 * Call monthly from any scheduler (cron-job.org, Zeabur cron, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tariffRates } from '@/db/schema';
import { defaultTariffRateByTariffKey, normalizeTariffKey } from '@/lib/tariffs';
import { round4 } from '@/lib/workflow';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    // Optional secret protection — set CRON_SECRET in Zeabur env vars
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
        const auth = req.headers.get('authorization') ?? '';
        if (auth !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    try {
        const rows = await db.select().from(tariffRates);
        const autoSynced = rows.filter((r) => r.source === 'sync');

        if (autoSynced.length === 0) {
            return NextResponse.json({ success: true, updated: 0, message: 'No auto-synced rows found' });
        }

        const updates = await Promise.all(
            autoSynced.map(async (row) => {
                const newRate = round4(defaultTariffRateByTariffKey(normalizeTariffKey(row.productClass)));
                await db
                    .update(tariffRates)
                    .set({ tariffRate: newRate.toFixed(4), updatedAt: new Date() })
                    .where(eq(tariffRates.id, row.id));
                return { key: row.productClass, oldRate: Number(row.tariffRate), newRate };
            })
        );

        return NextResponse.json({
            success: true,
            updated: updates.length,
            refreshedAt: new Date().toISOString(),
            rows: updates,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
