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
import { FinanceSummary, PaymentRow, DocSummary } from '../types';
import { statusBadgeVariant } from '../utils';
import { useI18n } from '@/components/locale-provider';

export function FinanceTab({
    financeSummary,
    payments,
    busyAction,
    actions,
}: {
    financeSummary: FinanceSummary | null;
    payments: PaymentRow[];
    busyAction: string | null;
    actions: {
        editFinanceDoc: (
            targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
            doc: DocSummary
        ) => void;
        payOutstanding: (
            targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
            doc: DocSummary
        ) => void;
        deleteFinanceDoc: (
            targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
            id: string
        ) => void;
        editPayment: (row: PaymentRow) => void;
        deletePayment: (id: string) => void;
    };
}) {
    const { t } = useI18n();

    const DocTable = ({
        title,
        docs,
        targetType,
    }: {
        title: string;
        docs: DocSummary[];
        targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL';
    }) => (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('OrderWorkspace.code', 'Code')}</TableHead>
                            <TableHead>{t('OrderWorkspace.date', 'Due')}</TableHead>
                            <TableHead className="text-right">{t('OrderWorkspace.amount', 'Amount')}</TableHead>
                            <TableHead className="text-right">{t('OrderWorkspace.paid', 'Paid')}</TableHead>
                            <TableHead className="text-right">{t('OrderWorkspace.outstanding', 'Outstanding')}</TableHead>
                            <TableHead>{t('OrderWorkspace.status', 'Status')}</TableHead>
                            <TableHead className="text-right">{t('OrderWorkspace.action', 'Action')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {docs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                                    {t('OrderWorkspace.noDocuments', 'No documents')}
                                </TableCell>
                            </TableRow>
                        ) : (
                            docs.map((doc) => {
                                const actionKey = `PAY_${targetType}_${doc.id}`;
                                const deleteKey = `DELETE_DOC_${targetType}_${doc.id}`;
                                const editKey = `EDIT_DOC_${targetType}_${doc.id}`;
                                return (
                                    <TableRow key={doc.id}>
                                        <TableCell className="font-medium">{doc.code}</TableCell>
                                        <TableCell>{formatDate(doc.dueDate)}</TableCell>
                                        <TableCell className="text-right">{money(doc.amount)}</TableCell>
                                        <TableCell className="text-right">{money(doc.paid)}</TableCell>
                                        <TableCell className="text-right">{money(doc.outstanding)}</TableCell>
                                        <TableCell>
                                            <Badge variant={statusBadgeVariant(doc.status)}>
                                                {doc.status || 'OPEN'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === editKey}
                                                    onClick={() => actions.editFinanceDoc(targetType, doc)}
                                                >
                                                    {busyAction === editKey ? t('OrderWorkspace.saving', 'Saving...') : t('OrderWorkspace.edit', 'Edit')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={doc.outstanding <= 0 || busyAction === actionKey}
                                                    onClick={() => actions.payOutstanding(targetType, doc)}
                                                >
                                                    {busyAction === actionKey ? t('OrderWorkspace.posting', 'Posting...') : t('OrderWorkspace.pay', 'Pay')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === deleteKey}
                                                    onClick={() => actions.deleteFinanceDoc(targetType, doc.id)}
                                                >
                                                    {busyAction === deleteKey ? t('OrderWorkspace.deleting', 'Deleting...') : t('OrderWorkspace.delete', 'Delete')}
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('OrderWorkspace.financeSnapshot', 'Finance Snapshot')}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">{t('OrderWorkspace.customerAr', 'Customer AR')}</p>
                        <p>{t('OrderWorkspace.total', 'Total:')} {money(financeSummary?.totals.receivable || 0)}</p>
                        <p>{t('OrderWorkspace.paid', 'Paid:')} {money(financeSummary?.totals.receivablePaid || 0)}</p>
                        <p>{t('OrderWorkspace.outstanding', 'Outstanding:')} {money(financeSummary?.totals.receivableOutstanding || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">{t('OrderWorkspace.vendorAp', 'Vendor AP')}</p>
                        <p>{t('OrderWorkspace.total', 'Total:')} {money(financeSummary?.totals.vendorPayable || 0)}</p>
                        <p>{t('OrderWorkspace.paid', 'Paid:')} {money(financeSummary?.totals.vendorPaid || 0)}</p>
                        <p>{t('OrderWorkspace.outstanding', 'Outstanding:')} {money(financeSummary?.totals.vendorOutstanding || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">{t('OrderWorkspace.threePlAp', '3PL AP')}</p>
                        <p>{t('OrderWorkspace.total', 'Total:')} {money(financeSummary?.totals.logisticsPayable || 0)}</p>
                        <p>{t('OrderWorkspace.paid', 'Paid:')} {money(financeSummary?.totals.logisticsPaid || 0)}</p>
                        <p>{t('OrderWorkspace.outstanding', 'Outstanding:')} {money(financeSummary?.totals.logisticsOutstanding || 0)}</p>
                    </div>
                </CardContent>
            </Card>

            <DocTable
                title={t('OrderWorkspace.commercialInvoiceAr', 'Commercial Invoice (AR)')}
                docs={financeSummary?.invoices || []}
                targetType="CUSTOMER_INVOICE"
            />
            <DocTable
                title={t('OrderWorkspace.vendorBillAp', 'Vendor Bill (AP)')}
                docs={financeSummary?.vendorBills || []}
                targetType="VENDOR_BILL"
            />
            <DocTable
                title={t('OrderWorkspace.threePlBillAp', '3PL Bill (AP)')}
                docs={financeSummary?.logisticsBills || []}
                targetType="LOGISTICS_BILL"
            />

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{t('OrderWorkspace.payments', 'Payments')}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('OrderWorkspace.date', 'Date')}</TableHead>
                                <TableHead>{t('OrderWorkspace.direction', 'Direction')}</TableHead>
                                <TableHead>{t('OrderWorkspace.target', 'Target')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.amount', 'Amount')}</TableHead>
                                <TableHead>{t('OrderWorkspace.method', 'Method')}</TableHead>
                                <TableHead className="text-right">{t('OrderWorkspace.action', 'Action')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                        {t('OrderWorkspace.noPaymentPosted', 'No payment posted')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                payments.map((row) => (
                                    <TableRow key={row.id}>
                                        <TableCell>{formatDate(row.paymentDate)}</TableCell>
                                        <TableCell>
                                            <Badge variant={row.direction === 'IN' ? 'secondary' : 'outline'}>
                                                {row.direction}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{row.targetCode || row.targetId}</TableCell>
                                        <TableCell className="text-right">{money(num(row.amount))}</TableCell>
                                        <TableCell>{row.method || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `EDIT_PAYMENT_${row.id}`}
                                                    onClick={() => actions.editPayment(row)}
                                                >
                                                    {busyAction === `EDIT_PAYMENT_${row.id}` ? t('OrderWorkspace.saving', 'Saving...') : t('OrderWorkspace.edit', 'Edit')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `DELETE_PAYMENT_${row.id}`}
                                                    onClick={() => actions.deletePayment(row.id)}
                                                >
                                                    {busyAction === `DELETE_PAYMENT_${row.id}` ? t('OrderWorkspace.deleting', 'Deleting...') : t('OrderWorkspace.delete', 'Delete')}
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
        </div>
    );
}
