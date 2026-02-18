import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { desc } from 'drizzle-orm';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET() {
  try {
    const rows = await db
      .select({
        id: orders.id,
        vpoNumber: orders.vpoNumber,
        customerName: orders.customerName,
        supplierName: orders.supplierName,
        workflowStatus: orders.workflowStatus,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt));

    return NextResponse.json({ success: true, data: rows });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
