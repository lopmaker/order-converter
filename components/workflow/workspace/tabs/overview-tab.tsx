'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { money, formatDate } from '@/lib/format';
import {
    OrderDetails,
    ShippingDocRow,
    AllocationRow,
    FinanceSummary
} from '../types';
import { useI18n } from '@/components/locale-provider';

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
    const { t } = useI18n();

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('OrderWorkspace.orderContext', 'Order Context')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.orderDate', 'Order Date')}</span>
                            <span>{order.orderDate || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.expectedShip', 'Expected Ship')}</span>
                            <span>{order.expShipDate || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.shipTo', 'Ship To')}</span>
                            <span className="text-right">{order.shipTo || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.shipVia', 'Ship Via')}</span>
                            <span>{order.shipVia || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.paymentTerms', 'Payment Terms')}</span>
                            <span>{order.paymentTerms || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.deliveredAt', 'Delivered At')}</span>
                            <span>{formatDate(order.deliveredAt)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">{t('OrderWorkspace.closedAt', 'Closed At')}</span>
                            <span>{formatDate(order.closedAt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">{t('OrderWorkspace.autoNextSteps', 'Auto Next Steps')}</CardTitle>
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
                    <CardTitle className="text-sm">{t('OrderWorkspace.crossModuleSnapshot', 'Cross-Module Snapshot')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-4 text-sm">
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{t('OrderWorkspace.shippingDocs', 'Shipping Docs')}</p>
                        <p className="text-xl font-semibold">{shippingDocs.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{t('OrderWorkspace.containerAllocations', 'Container Allocations')}</p>
                        <p className="text-xl font-semibold">{allocations.length}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{t('OrderWorkspace.arOutstanding', 'AR Outstanding')}</p>
                        <p className="text-xl font-semibold">
                            {money(financeSummary?.totals.receivableOutstanding || 0)}
                        </p>
                    </div>
                    <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{t('OrderWorkspace.apOutstanding', 'AP Outstanding')}</p>
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
