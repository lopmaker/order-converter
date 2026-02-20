import { db } from '@/db';
export const dynamic = 'force-dynamic';
import {
  commercialInvoices,
  logisticsBills,
  orders,
  payments,
  shippingDocuments,
  vendorBills,
} from '@/db/schema';
import { desc, sql } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrdersTable } from '@/components/orders-table';
import { BusinessFlowSnapshot, WorkflowMapCard } from '@/components/workflow/workflow-map-card';
import { Package, DollarSign, Calendar } from 'lucide-react';
import Link from 'next/link';
import { type Order, type SerializedOrder } from '@/lib/types';

const PAGE_SIZE = 10;

// Helper to convert Date objects in an Order to string for client components
function serializeDatesInOrder(order: Order): SerializedOrder {
  return {
    ...order,
    orderDate: order.orderDate?.toISOString() || null,
    expShipDate: order.expShipDate?.toISOString() || null,
    cancelDate: order.cancelDate?.toISOString() || null,
    deliveredAt: order.deliveredAt?.toISOString() || null,
    closedAt: order.closedAt?.toISOString() || null,
    createdAt: order.createdAt?.toISOString() || null,
  };
}



async function getRecentOrders(page: number, pageSize: number): Promise<{ orders: SerializedOrder[]; hasMore: boolean }> {
  const fetchedOrders: Order[] = await db.query.orders.findMany({
    orderBy: desc(orders.createdAt),
    limit: pageSize + 1,
    offset: (page - 1) * pageSize,
  });

  const hasMore = fetchedOrders.length > pageSize;
  const serializedOrders: SerializedOrder[] = fetchedOrders.slice(0, pageSize).map(serializeDatesInOrder);

  return { orders: serializedOrders, hasMore };
}

async function getStats() {
  try {
    const [
      salesAgg,
      marginAgg,
      countAgg,
      stageAgg,
      shippingDocStats,
      commercialStats,
      vendorStats,
      logisticsStats,
      paymentStats,
      salesByMonthStats,
    ] = await Promise.all([
      db
        .select({ total: sql<number>`sum(CAST(${orders.totalAmount} AS NUMERIC))`.mapWith(Number) })
        .from(orders),
      db
        .select({
          total: sql<number>`sum(CAST(${orders.estimatedMargin} AS NUMERIC))`.mapWith(Number),
        })
        .from(orders),
      db.select({ count: sql<number>`count(*)` }).from(orders),
      db
        .select({
          status: orders.workflowStatus,
          count: sql<number>`count(*)`,
        })
        .from(orders)
        .where(sql`${orders.workflowStatus} IS NOT NULL`)
        .groupBy(orders.workflowStatus),
      db.select({ count: sql<number>`count(*)` }).from(shippingDocuments),
      db
        .select({ status: commercialInvoices.status, count: sql<number>`count(*)` })
        .from(commercialInvoices)
        .groupBy(commercialInvoices.status),
      db
        .select({ status: vendorBills.status, count: sql<number>`count(*)` })
        .from(vendorBills)
        .groupBy(vendorBills.status),
      db
        .select({ status: logisticsBills.status, count: sql<number>`count(*)` })
        .from(logisticsBills)
        .groupBy(logisticsBills.status),
      db.select({ count: sql<number>`count(*)` }).from(payments),
      db
        .select({
          month: sql<string>`TO_CHAR(${orders.createdAt}, 'Mon')`,
          total: sql<number>`sum(CAST(${orders.totalAmount} AS NUMERIC))`.mapWith(Number),
        })
        .from(orders)
        .where(sql`${orders.createdAt} IS NOT NULL`)
        .groupBy(sql`TO_CHAR(${orders.createdAt}, 'Mon')`)
        .orderBy(sql`MIN(${orders.createdAt})`),
    ]);

    const totalSales = salesAgg[0]?.total || 0;
    const totalEstimatedMargin = marginAgg[0]?.total || 0;
    const totalOrders = countAgg[0]?.count || 0;

    const stageCounts: Record<string, number> = {};
    stageAgg.forEach((row) => {
      if (row.status) stageCounts[row.status] = row.count;
    });

    const toBillStats = (rows: Array<{ status: string | null; count: number }>) => {
      return rows.reduce(
        (acc, row) => {
          const normalized = (row.status || 'OPEN').toUpperCase();
          acc.total += row.count;
          if (normalized === 'PAID') acc.paid += row.count;
          else if (normalized === 'PARTIAL') acc.partial += row.count;
          else acc.open += row.count;
          return acc;
        },
        { total: 0, open: 0, partial: 0, paid: 0 },
      );
    };

    const flowSnapshot: BusinessFlowSnapshot = {
      totalOrders,
      stageCounts,
      shippingDocs: shippingDocStats[0]?.count || 0,
      commercialInvoices: toBillStats(commercialStats),
      vendorBills: toBillStats(vendorStats),
      logisticsBills: toBillStats(logisticsStats),
      payments: paymentStats[0]?.count || 0,
    };

    const chartData = salesByMonthStats.map((item) => ({ name: item.month, total: item.total }));

    // Removed allOrders fetch from here, it will be fetched by OrdersTable directly later.

    return { allOrders: [], totalSales, totalEstimatedMargin, totalOrders, chartData, flowSnapshot };
  } catch (error) {
    console.warn('Database not ready:', error);
    return {
      allOrders: [],
      totalSales: 0,
      totalEstimatedMargin: 0,
      totalOrders: 0,
      chartData: [],
      flowSnapshot: {
        totalOrders: 0,
        stageCounts: {},
        shippingDocs: 0,
        commercialInvoices: { total: 0, open: 0, partial: 0, paid: 0 },
        vendorBills: { total: 0, open: 0, partial: 0, paid: 0 },
        logisticsBills: { total: 0, open: 0, partial: 0, paid: 0 },
        payments: 0,
      } satisfies BusinessFlowSnapshot,
    };
  }
}

export default async function DashboardPage() {
  const { totalSales, totalEstimatedMargin, totalOrders, flowSnapshot } =
    await getStats();

  const { orders: recentOrders, hasMore: initialHasMore } = await getRecentOrders(1, PAGE_SIZE);

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Sales Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Link
            href="/dashboard/tariffs"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2"
          >
            Tariffs
          </Link>
          <Link
            href="/dashboard/logistics"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2"
          >
            Logistics
          </Link>
          <Link
            href="/dashboard/finance"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2"
          >
            Finance
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            New Order (Converter)
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSales.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">All time revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders}</div>
            <p className="text-xs text-muted-foreground">Processed & Confirmed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Today</div>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-1 mt-8">
        <WorkflowMapCard snapshot={flowSnapshot} />
      </div>

      <div className="grid gap-4 md:grid-cols-1">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <OrdersTable initialOrders={recentOrders} initialHasMore={initialHasMore} pageSize={PAGE_SIZE} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
