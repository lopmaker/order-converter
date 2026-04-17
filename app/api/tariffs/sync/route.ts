import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orderItems, orders, tariffRates } from '@/db/schema';
import {
  defaultTariffRateByTariffKey,
  deriveTariffKey,
  inferOriginCountry,
  normalizeTariffKey,
} from '@/lib/tariffs';
import { parseDecimalInput, round4 } from '@/lib/workflow';
import { eq } from 'drizzle-orm';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function POST() {
  try {
    const rows = await db
      .select({
        description: orderItems.description,
        collection: orderItems.collection,
        material: orderItems.material,
        supplierName: orders.supplierName,
        supplierAddress: orders.supplierAddress,
      })
      .from(orderItems)
      .leftJoin(orders, eq(orderItems.orderId, orders.id));

    const tariffKeys = Array.from(
      new Set(
        rows.map((row) => {
          const baseTariffKey = deriveTariffKey({
            description: row.description,
            collection: row.collection,
            material: row.material,
          });
          const originCountry = inferOriginCountry(
            row.supplierName,
            row.supplierAddress
          ).toLowerCase();
          return normalizeTariffKey(`${originCountry} | ${baseTariffKey}`);
        })
      )
    );

    if (tariffKeys.length === 0) {
      return NextResponse.json({ success: true, synced: 0, data: [] });
    }

    const existingRows = await db.select().from(tariffRates);
    const existing = new Map<string, number>(
      existingRows.map((row) => [
        normalizeTariffKey(row.productClass),
        parseDecimalInput(row.tariffRate, 0),
      ])
    );

    const missingKeys = tariffKeys.filter((tariffKey) => !existing.has(tariffKey));

    if (missingKeys.length > 0) {
      await db.insert(tariffRates).values(
        missingKeys.map((tariffKey) => ({
          productClass: tariffKey,
          tariffRate: round4(defaultTariffRateByTariffKey(tariffKey)).toFixed(4),
          source: 'sync',
          notes: 'Auto-synced from description + collection + material',
        }))
      );
    }

    // Also refresh rates on existing auto-synced rows so HTS / surcharge changes propagate
    const autoSyncedRows = existingRows.filter((row) => row.source === 'sync');
    for (const row of autoSyncedRows) {
      const newRate = round4(defaultTariffRateByTariffKey(normalizeTariffKey(row.productClass)));
      await db
        .update(tariffRates)
        .set({ tariffRate: newRate.toFixed(4) })
        .where(eq(tariffRates.id, row.id));
    }

    const refreshed = await db.select().from(tariffRates);

    return NextResponse.json({
      success: true,
      synced: missingKeys.length,
      data: refreshed.map((row) => ({
        ...row,
        tariffKey: row.productClass,
        tariffRate: Number(row.tariffRate || 0),
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
