import { db } from "@/db";
import {
    commercialInvoices,
    logisticsBills,
    orders,
    payments,
    shippingDocuments,
    vendorBills,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrdersTable } from "@/components/orders-table";
import { BusinessFlowSnapshot, WorkflowMapCard } from "@/components/workflow/workflow-map-card";
import { Package, DollarSign, Calendar } from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getStats() {
    try {
        const [
            allOrders,
            shippingDocRows,
            commercialRows,
            vendorRows,
            logisticsRows,
            paymentRows,
        ] = await Promise.all([
            db.select().from(orders).orderBy(desc(orders.createdAt)),
            db.select({ id: shippingDocuments.id }).from(shippingDocuments),
            db.select({ status: commercialInvoices.status }).from(commercialInvoices),
            db.select({ status: vendorBills.status }).from(vendorBills),
            db.select({ status: logisticsBills.status, orderId: logisticsBills.orderId }).from(logisticsBills),
            db.select({ id: payments.id }).from(payments),
        ]);

        const totalSales = allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const totalEstimatedMargin = allOrders.reduce((sum, order) => sum + Number(order.estimatedMargin || 0), 0);
        const totalOrders = allOrders.length;
        const stageCounts = allOrders.reduce<Record<string, number>>((acc, order) => {
            const status = (order.workflowStatus || "PO_UPLOADED").toUpperCase();
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});

        const toBillStats = (rows: Array<{ status: string | null }>) => {
            return rows.reduce(
                (acc, row) => {
                    const normalized = (row.status || "OPEN").toUpperCase();
                    acc.total += 1;
                    if (normalized === "PAID") acc.paid += 1;
                    else if (normalized === "PARTIAL") acc.partial += 1;
                    else acc.open += 1;
                    return acc;
                },
                { total: 0, open: 0, partial: 0, paid: 0 }
            );
        };
        const validOrderIds = new Set(allOrders.map((order) => order.id));
        const linkedLogisticsRows = logisticsRows
            .filter((row) => !!row.orderId && validOrderIds.has(row.orderId))
            .map((row) => ({ status: row.status }));

        const flowSnapshot: BusinessFlowSnapshot = {
            totalOrders,
            stageCounts,
            shippingDocs: shippingDocRows.length,
            commercialInvoices: toBillStats(commercialRows),
            vendorBills: toBillStats(vendorRows),
            logisticsBills: toBillStats(linkedLogisticsRows),
            payments: paymentRows.length,
        };

        // Group by month for chart (simple implementation)
        const salesByMonth: Record<string, number> = {};
        allOrders.forEach(order => {
            if (!order.createdAt) return;
            const date = new Date(order.createdAt);
            const key = date.toLocaleString('default', { month: 'short' });
            salesByMonth[key] = (salesByMonth[key] || 0) + Number(order.totalAmount || 0);
        });

        const chartData = Object.entries(salesByMonth).map(([name, total]) => ({ name, total }));

        return { allOrders, totalSales, totalEstimatedMargin, totalOrders, chartData, flowSnapshot };
    } catch (error) {
        console.warn("Database not ready:", error);
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
    const { allOrders, totalSales, totalEstimatedMargin, totalOrders, flowSnapshot } = await getStats();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Sales Dashboard</h2>
                <div className="flex items-center space-x-2">
                    <Link href="/dashboard/tariffs" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2">
                        Tariffs
                    </Link>
                    <Link href="/dashboard/logistics" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2">
                        Logistics
                    </Link>
                    <Link href="/dashboard/finance" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent h-9 px-4 py-2">
                        Finance
                    </Link>
                    <Link href="/" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Back to Converter
                    </Link>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
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
                        <CardTitle className="text-sm font-medium">Est. Margin</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${totalEstimatedMargin.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">Includes duty + est. 3PL</p>
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
                        <p className="text-xs text-muted-foreground">
                            {new Date().toLocaleDateString()}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                <WorkflowMapCard snapshot={flowSnapshot} />
            </div>

            <div className="grid gap-4 md:grid-cols-1">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Recent Orders</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <OrdersTable initialOrders={allOrders} />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
