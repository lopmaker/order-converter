import { NextResponse } from 'next/server';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { desc, sql, eq } from 'drizzle-orm';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // 'asc' or 'desc'
    const customerNameFilter = searchParams.get('customerName');
    const statusFilter = searchParams.get('status');
    const workflowStatusFilter = searchParams.get('workflowStatus');
    const vpoNumberFilter = searchParams.get('vpoNumber');

    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    if (customerNameFilter) {
      whereConditions.push(eq(orders.customerName, customerNameFilter));
    }
    if (statusFilter) {
      whereConditions.push(eq(orders.status, statusFilter));
    }
    if (workflowStatusFilter) {
      whereConditions.push(eq(orders.workflowStatus, workflowStatusFilter));
    }
    if (vpoNumberFilter) {
      whereConditions.push(eq(orders.vpoNumber, vpoNumberFilter));
    }

    const orderByClause =
      sortOrder === 'asc'
        ? sql`${orders[sortBy as keyof typeof orders]} ASC`
        : sql`${orders[sortBy as keyof typeof orders]} DESC`;

    const dataQuery = db
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
      .$dynamic()
      .where(whereConditions.length > 0 ? sql.join(whereConditions, 'and') : undefined)
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .$dynamic()
      .where(whereConditions.length > 0 ? sql.join(whereConditions, 'and') : undefined);

    const [rows, totalCountResult] = await Promise.all([dataQuery, countQuery]);

    const total = totalCountResult[0].count;
    const totalPages = Math.ceil(total / pageSize);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        pageSize,
        totalPages,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
