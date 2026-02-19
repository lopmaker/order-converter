import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money, formatDate } from '@/lib/format';
import {
    OrderDetails,
    ShippingDocRow,
    AllocationRow,
    FinanceSummary
} from '../types';

export function OverviewTab({
    order,
    hints,
    shippingDocs,
    allocations,
    financeSummary,
}: {
    order: OrderDetails;
    hints: string[];
    shippingDocs: ShippingDocRow[];
    allocations: AllocationRow[];
    financeSummary: FinanceSummary | null;
}) {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Order Context</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Order Date</span>
                            <span>{order.orderDate || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Expected Ship</span>
                            <span>{order.expShipDate || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Ship To</span>
                            <span className="text-right">{order.shipTo || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Ship Via</span>
                            <span>{order.shipVia || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Payment Terms</span>
                            <span>{order.paymentTerms || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Delivered At</span>
                            <span>{formatDate(order.deliveredAt)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Closed At</span>
                            <span>{formatDate(order.closedAt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Auto Next Steps</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {hints.map((hint, index) => (
                            <div
                                key={`${hint}-${index}`}
                                className="rounded-md border bg-muted/30 p-2 text-xs"
                            >
                                {index + 1}. {hint}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Cross-Module Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4 text-sm">
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Shipping Docs</p>
                        <p className="text-xl font-semibold">{shippingDocs.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Container Allocations</p>
                        <p className="text-xl font-semibold">{allocations.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">AR Outstanding</p>
                        <p className="text-xl font-semibold">
                            {money(financeSummary?.totals.receivableOutstanding || 0)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">AP Outstanding</p>
                        <p className="text-xl font-semibold">
                            {money(
                                (financeSummary?.totals.vendorOutstanding || 0) +
                                (financeSummary?.totals.logisticsOutstanding || 0)
                            )}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
