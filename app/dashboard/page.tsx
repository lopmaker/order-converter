
import { db } from "@/db";
import { orders } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrdersTable } from "@/components/orders-table";
import { Package, DollarSign, Calendar } from "lucide-react";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getStats() {
    try {
        const allOrders = await db.select().from(orders).orderBy(desc(orders.createdAt));

        const totalSales = allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
        const totalOrders = allOrders.length;

        // Group by month for chart (simple implementation)
        const salesByMonth: Record<string, number> = {};
        allOrders.forEach(order => {
            if (!order.createdAt) return;
            const date = new Date(order.createdAt);
            const key = date.toLocaleString('default', { month: 'short' });
            salesByMonth[key] = (salesByMonth[key] || 0) + Number(order.totalAmount || 0);
        });

        const chartData = Object.entries(salesByMonth).map(([name, total]) => ({ name, total }));

        return { allOrders, totalSales, totalOrders, chartData };
    } catch (error) {
        console.warn("Database not ready:", error);
        return { allOrders: [], totalSales: 0, totalOrders: 0, chartData: [] };
    }
}

export default async function DashboardPage() {
    const { allOrders, totalSales, totalOrders } = await getStats();

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">Sales Dashboard</h2>
                <div className="flex items-center space-x-2">
                    <a href="/" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        Back to Converter
                    </a>
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
                        <p className="text-xs text-muted-foreground">
                            {new Date().toLocaleDateString()}
                        </p>
                    </CardContent>
                </Card>
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
