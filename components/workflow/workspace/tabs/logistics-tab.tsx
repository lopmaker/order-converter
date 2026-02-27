'use client';

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
import { money, num, formatDate } from '@/lib/format';
import { ShippingDocRow, AllocationRow, ContainerRow } from '../types';
import { statusBadgeVariant } from '../utils';
import { useI18n } from '@/components/locale-provider';

export function LogisticsTab({
    shippingDocs,
    allocations,
    relevantContainerOptions,
    containerMap,
    busyAction,
    actions,
}: {
    shippingDocs: ShippingDocRow[];
    allocations: AllocationRow[];
    relevantContainerOptions: ContainerRow[];
    containerMap: Map<string, ContainerRow>;
    busyAction: string | null;
    actions: {
        editShippingDoc: (row: ShippingDocRow) => void;
        deleteShippingDoc: (id: string) => void;
        editAllocation: (row: AllocationRow) => void;
        deleteAllocation: (id: string) => void;
    };
}) {
    const { t } = useI18n();

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('OrderWorkspace.shippingDocuments', 'Shipping Documents')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('OrderWorkspace.docNo', 'Doc No')}</TableHead>
                                <TableHead>{t('OrderWorkspace.container', 'Container')}</TableHead>
                                <TableHead>{t('OrderWorkspace.issueDate', 'Issue Date')}</TableHead>
                                <TableHead>{t('OrderWorkspace.status', 'Status')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.action', 'Action')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shippingDocs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                        {t('OrderWorkspace.noShippingDocYet', 'No shipping document yet')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                shippingDocs.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">{row.docNo}</TableCell>
                                        <TableCell>
                                            {row.containerId
                                                ? containerMap.get(row.containerId)?.containerNo || row.containerId
                                                : '-'}
                                        </TableCell>
                                        <TableCell>{formatDate(row.issueDate)}</TableCell>
                                        <TableCell>
                                            <Badge variant={statusBadgeVariant(row.status)}>
                                                {row.status || '-'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `EDIT_SHIPPING_DOC_${row.id}`}
                                                    onClick={() => actions.editShippingDoc(row)}
                                                >
                                                    {busyAction === `EDIT_SHIPPING_DOC_${row.id}` ? t('OrderWorkspace.saving', 'Saving...') : t('OrderWorkspace.edit', 'Edit')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `DELETE_SHIPPING_DOC_${row.id}`}
                                                    onClick={() => actions.deleteShippingDoc(row.id)}
                                                >
                                                    {busyAction === `DELETE_SHIPPING_DOC_${row.id}`
                                                        ? t('OrderWorkspace.deleting', 'Deleting...')
                                                        : t('OrderWorkspace.delete', 'Delete')}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('OrderWorkspace.containerAllocationsTitle', 'Container Allocations')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('OrderWorkspace.container', 'Container')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.allocatedQty', 'Allocated Qty')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.allocatedAmount', 'Allocated Amount')}</TableHead>
                                <TableHead>{t('OrderWorkspace.created', 'Created')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.action', 'Action')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {allocations.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                                        {t('OrderWorkspace.noAllocationsYet', 'No allocations yet')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                allocations.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>
                                            {containerMap.get(row.containerId)?.containerNo || row.containerId}
                                        </TableCell>
                                        <TableCell className="text-right">{row.allocatedQty ?? '-'}</TableCell>
                                        <TableCell className="text-right">
                                            {row.allocatedAmount ? money(num(row.allocatedAmount)) : '-'}
                                        </TableCell>
                                        <TableCell>{formatDate(row.createdAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `EDIT_ALLOCATION_${row.id}`}
                                                    onClick={() => actions.editAllocation(row)}
                                                >
                                                    {busyAction === `EDIT_ALLOCATION_${row.id}` ? t('OrderWorkspace.saving', 'Saving...') : t('OrderWorkspace.edit', 'Edit')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `DELETE_ALLOCATION_${row.id}`}
                                                    onClick={() => actions.deleteAllocation(row.id)}
                                                >
                                                    {busyAction === `DELETE_ALLOCATION_${row.id}`
                                                        ? t('OrderWorkspace.deleting', 'Deleting...')
                                                        : t('OrderWorkspace.delete', 'Delete')}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('OrderWorkspace.relatedContainers', 'Related Containers')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('OrderWorkspace.container', 'Container')}</TableHead>
                                <TableHead>{t('OrderWorkspace.vessel', 'Vessel')}</TableHead>
                                <TableHead>{t('OrderWorkspace.status', 'Status')}</TableHead>
                                <TableHead>{t('OrderWorkspace.atd', 'ATD')}</TableHead>
                                <TableHead>{t('OrderWorkspace.eta', 'ETA')}</TableHead>
                                <TableHead>{t('OrderWorkspace.arrivalWh', 'Arrival WH')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {relevantContainerOptions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                        {t('OrderWorkspace.noLinkedContainer', 'No linked container')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                relevantContainerOptions.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell className="font-medium">{row.containerNo}</TableCell>
                                        <TableCell>{row.vesselName || '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={statusBadgeVariant(row.status)}>
                                                {row.status || '-'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{formatDate(row.atd)}</TableCell>
                                        <TableCell>{formatDate(row.eta)}</TableCell>
                                        <TableCell>{formatDate(row.arrivalAtWarehouse)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
