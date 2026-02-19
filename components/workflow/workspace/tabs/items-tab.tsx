import { Fragment, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { money, num } from '@/lib/format';
import { OrderDetails } from '../types';

export function ItemsTab({ order }: { order: OrderDetails }) {
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleExpand = (id: string) => {
        const next = new Set(expandedItems);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedItems(next);
    };

    const itemTotals = useMemo(() => {
        const items = order?.items || [];
        return {
            qty: items.reduce((sum, item) => sum + num(item.quantity), 0),
            revenue: items.reduce((sum, item) => sum + num(item.total), 0),
            vendorCost: items.reduce(
                (sum, item) => sum + num(item.vendorUnitPrice) * num(item.quantity),
                0
            ),
            duty: items.reduce((sum, item) => sum + num(item.estimatedDutyCost), 0),
            est3pl: items.reduce((sum, item) => sum + num(item.estimated3plCost), 0),
            margin: items.reduce((sum, item) => sum + num(item.estimatedMargin), 0),
        };
    }, [order]);

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Line Items and Estimated Margin</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40px]"></TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Collection</TableHead>
                                <TableHead>Material</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Customer $</TableHead>
                                <TableHead className="text-right">Vendor $</TableHead>
                                <TableHead className="text-right">Duty</TableHead>
                                <TableHead className="text-right">Est 3PL</TableHead>
                                <TableHead className="text-right">Est Margin</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {order.items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                                        No items found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                <>
                                    {order.items.map((item) => {
                                        const qty = num(item.quantity) || 1;
                                        const customerUnit = num(item.customerUnitPrice);
                                        const vendorUnit = num(item.vendorUnitPrice);
                                        const margin = num(item.estimatedMargin);
                                        const dutyCost = num(item.estimatedDutyCost);
                                        const total3pl = num(item.estimated3plCost);

                                        const isExpanded = expandedItems.has(item.id);

                                        return (
                                            <Fragment key={item.id}>
                                                <TableRow className={isExpanded ? 'border-b-0 bg-muted/50' : ''}>
                                                    <TableCell>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 w-8 p-0"
                                                            onClick={() => toggleExpand(item.id)}
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronDown className="h-4 w-4" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                    </TableCell>
                                                    <TableCell className="font-medium">{item.productCode || '-'}</TableCell>
                                                    <TableCell>{item.description || '-'}</TableCell>
                                                    <TableCell>{item.collection || '-'}</TableCell>
                                                    <TableCell>{item.material || '-'}</TableCell>
                                                    <TableCell className="text-right">{num(item.quantity)}</TableCell>
                                                    <TableCell className="text-right">{money(customerUnit)}</TableCell>
                                                    <TableCell className="text-right">{money(vendorUnit)}</TableCell>
                                                    <TableCell className="text-right">{money(dutyCost)}</TableCell>
                                                    <TableCell className="text-right">{money(total3pl)}</TableCell>
                                                    <TableCell className="text-right">
                                                        <span
                                                            className={margin >= 0 ? 'text-emerald-600' : 'text-destructive'}
                                                        >
                                                            {money(margin)}
                                                        </span>
                                                    </TableCell>
                                                </TableRow>
                                                {isExpanded && (
                                                    <TableRow>
                                                        <TableCell colSpan={11} className="bg-muted/10 p-0">
                                                            <div className="flex items-center gap-6 border-b p-4 bg-slate-50/50 text-sm">
                                                                <div className="flex-1 space-y-1">
                                                                    <span className="text-xs font-medium text-muted-foreground block">
                                                                        Tariff Info
                                                                    </span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-medium">
                                                                            {(num(item.tariffRate) * 100).toFixed(1)}%
                                                                        </span>
                                                                        <Badge variant="outline" className="text-[10px] h-5">
                                                                            {item.productClass || 'No Class'}
                                                                        </Badge>
                                                                    </div>
                                                                </div>

                                                                <div className="flex-1 space-y-1">
                                                                    <span className="text-xs font-medium text-muted-foreground block">
                                                                        Duty
                                                                    </span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-muted-foreground text-xs">Per Unit:</span>
                                                                        <span className="font-medium">{money(dutyCost / qty)}</span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex-1 space-y-1">
                                                                    <span className="text-xs font-medium text-muted-foreground block">
                                                                        3PL Cost (Per Unit)
                                                                    </span>
                                                                    <div className="font-bold text-blue-700 text-base">
                                                                        {money(total3pl / qty)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                    <TableRow className="bg-muted/30 font-medium">
                                        <TableCell colSpan={5}>Totals</TableCell>
                                        <TableCell className="text-right">{itemTotals.qty}</TableCell>
                                        <TableCell className="text-right">{money(itemTotals.revenue)}</TableCell>
                                        <TableCell className="text-right">{money(itemTotals.vendorCost)}</TableCell>
                                        <TableCell className="text-right">{money(itemTotals.duty)}</TableCell>
                                        <TableCell className="text-right">{money(itemTotals.est3pl)}</TableCell>
                                        <TableCell className="text-right">{money(itemTotals.margin)}</TableCell>
                                    </TableRow>
                                </>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
