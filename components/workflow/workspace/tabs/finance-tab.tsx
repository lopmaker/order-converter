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
                            <TableHead>Code</TableHead>
                            <TableHead>Due</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {docs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                                    No documents
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
                                                    {busyAction === editKey ? 'Saving...' : 'Edit'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={doc.outstanding <= 0 || busyAction === actionKey}
                                                    onClick={() => actions.payOutstanding(targetType, doc)}
                                                >
                                                    {busyAction === actionKey ? 'Posting...' : 'Pay'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === deleteKey}
                                                    onClick={() => actions.deleteFinanceDoc(targetType, doc.id)}
                                                >
                                                    {busyAction === deleteKey ? 'Deleting...' : 'Delete'}
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
                    <CardTitle className="text-sm">Finance Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3 text-sm">
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">Customer AR</p>
                        <p>Total: {money(financeSummary?.totals.receivable || 0)}</p>
                        <p>Paid: {money(financeSummary?.totals.receivablePaid || 0)}</p>
                        <p>Outstanding: {money(financeSummary?.totals.receivableOutstanding || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">Vendor AP</p>
                        <p>Total: {money(financeSummary?.totals.vendorPayable || 0)}</p>
                        <p>Paid: {money(financeSummary?.totals.vendorPaid || 0)}</p>
                        <p>Outstanding: {money(financeSummary?.totals.vendorOutstanding || 0)}</p>
                    </div>
                    <div className="rounded-lg border p-3 space-y-1">
                        <p className="font-medium">3PL AP</p>
                        <p>Total: {money(financeSummary?.totals.logisticsPayable || 0)}</p>
                        <p>Paid: {money(financeSummary?.totals.logisticsPaid || 0)}</p>
                        <p>Outstanding: {money(financeSummary?.totals.logisticsOutstanding || 0)}</p>
                    </div>
                </CardContent>
            </Card>

            <DocTable
                title="Commercial Invoice (AR)"
                docs={financeSummary?.invoices || []}
                targetType="CUSTOMER_INVOICE"
            />
            <DocTable
                title="Vendor Bill (AP)"
                docs={financeSummary?.vendorBills || []}
                targetType="VENDOR_BILL"
            />
            <DocTable
                title="3PL Bill (AP)"
                docs={financeSummary?.logisticsBills || []}
                targetType="LOGISTICS_BILL"
            />

            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Payments</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Direction</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {payments.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                                        No payment posted
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
                                                    {busyAction === `EDIT_PAYMENT_${row.id}` ? 'Saving...' : 'Edit'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busyAction === `DELETE_PAYMENT_${row.id}`}
                                                    onClick={() => actions.deletePayment(row.id)}
                                                >
                                                    {busyAction === `DELETE_PAYMENT_${row.id}` ? 'Deleting...' : 'Delete'}
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
