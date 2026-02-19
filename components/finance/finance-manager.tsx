'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { money, formatDate } from '@/lib/format';
import { usePromptDialog, PromptDialog } from '@/components/ui/prompt-dialog';

interface OrderOption {
  id: string;
  vpoNumber: string;
  workflowStatus: string | null;
  totalAmount: string | null;
}

interface DocSummary {
  id: string;
  code: string;
  amount: number;
  paid: number;
  outstanding: number;
  dueDate: string | null;
  status: string | null;
}

interface FinanceSummary {
  invoices: DocSummary[];
  vendorBills: DocSummary[];
  logisticsBills: DocSummary[];
  totals: {
    receivable: number;
    receivablePaid: number;
    receivableOutstanding: number;
    vendorPayable: number;
    vendorPaid: number;
    vendorOutstanding: number;
    logisticsPayable: number;
    logisticsPaid: number;
    logisticsOutstanding: number;
  };
}

interface ContainerOption {
  id: string;
  containerNo: string;
  status: string | null;
}

interface LogisticsBillRow {
  id: string;
  billNo: string;
  orderId: string | null;
  containerId: string | null;
  provider: string | null;
  dueDate: string | null;
  amount: string | null;
  status: string | null;
}

export function FinanceManager() {
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState('');
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [logisticsBills, setLogisticsBills] = useState<LogisticsBillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { openPrompt, promptDialogProps } = usePromptDialog();

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );
  const apTotals = useMemo(() => {
    return {
      total: (summary?.totals.vendorPayable || 0) + (summary?.totals.logisticsPayable || 0),
      paid: (summary?.totals.vendorPaid || 0) + (summary?.totals.logisticsPaid || 0),
      outstanding:
        (summary?.totals.vendorOutstanding || 0) + (summary?.totals.logisticsOutstanding || 0),
    };
  }, [summary]);

  const loadOrders = useCallback(async () => {
    const res = await fetch('/api/orders', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.data)) return;

    const rows = data.data as OrderOption[];
    setOrders(rows);
    if (!selectedOrderId && rows.length > 0) {
      setSelectedOrderId(rows[0].id);
    }
  }, [selectedOrderId]);

  const loadContainers = useCallback(async () => {
    const res = await fetch('/api/logistics/containers', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success || !Array.isArray(data.data)) return;
    const rows = data.data as ContainerOption[];
    setContainers(rows);
    if (!selectedContainerId && rows.length > 0) {
      setSelectedContainerId(rows[0].id);
    }
  }, [selectedContainerId]);

  const loadSummary = useCallback(async (orderId: string) => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/orders/${orderId}/summary`, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary(data.data as FinanceSummary);
      } else {
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogisticsBills = useCallback(async (containerId?: string) => {
    if (!containerId) {
      setLogisticsBills([]);
      return;
    }
    const res = await fetch(`/api/finance/logistics-bills?containerId=${containerId}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    if (res.ok && data.success && Array.isArray(data.data)) {
      setLogisticsBills(data.data as LogisticsBillRow[]);
    } else {
      setLogisticsBills([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadOrders(), loadContainers()]);
    };
    init();
  }, [loadOrders, loadContainers]);

  useEffect(() => {
    if (!selectedOrderId) return;
    loadSummary(selectedOrderId);
  }, [selectedOrderId, loadSummary]);

  useEffect(() => {
    if (!selectedContainerId) return;
    loadLogisticsBills(selectedContainerId);
  }, [selectedContainerId, loadLogisticsBills]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
      if (selectedOrderId) {
        await loadSummary(selectedOrderId);
        await loadOrders();
      }
      await loadContainers();
      if (selectedContainerId) {
        await loadLogisticsBills(selectedContainerId);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const readError = async (res: Response, fallback: string) => {
    const data = await res.json().catch(() => ({}));
    return data?.error || fallback;
  };

  const createTransitDocs = async () => {
    if (!selectedOrderId) return;
    await runAction('CREATE_TRANSIT_DOCS', async () => {
      await fetch(`/api/workflow/orders/${selectedOrderId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'START_TRANSIT' }),
      });
    });
  };

  const createAR = async () => {
    if (!selectedOrderId) return;
    await runAction('CREATE_AR', async () => {
      await fetch('/api/finance/commercial-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrderId }),
      });
    });
  };

  const createVendorAP = async () => {
    if (!selectedOrderId) return;
    await runAction('CREATE_VENDOR_AP', async () => {
      await fetch('/api/finance/vendor-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: selectedOrderId }),
      });
    });
  };

  const createLogisticsAP = async () => {
    if (!selectedContainerId) return;
    const result = await openPrompt({
      title: 'Create 3PL Bill',
      fields: [
        { key: 'amount', label: 'Amount (required)', placeholder: 'e.g. 1500.00' },
        { key: 'dueDate', label: 'Due date (YYYY-MM-DD)', placeholder: 'optional' },
      ],
    });
    if (!result) return;
    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    await runAction('CREATE_LOGISTICS_AP', async () => {
      const res = await fetch('/api/finance/logistics-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderId || undefined,
          containerId: selectedContainerId,
          amount,
          dueDate: result.dueDate.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to create 3PL AP'));
    });
  };

  const payOutstanding = async (
    targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
    doc: DocSummary
  ) => {
    if (doc.outstanding <= 0) return;
    await runAction(`PAY_${targetType}_${doc.id}`, async () => {
      await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId: doc.id,
          amount: doc.outstanding,
        }),
      });
    });
  };

  const payLogisticsBill = async (doc: LogisticsBillRow) => {
    const amountDue = Number(doc.amount || 0);
    const result = await openPrompt({
      title: 'Pay 3PL Bill',
      fields: [
        {
          key: 'amount',
          label: 'Payment amount',
          defaultValue: amountDue > 0 ? String(amountDue) : '',
        },
      ],
    });
    if (!result) return;
    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    await runAction(`PAY_LOGISTICS_${doc.id}`, async () => {
      const res = await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'LOGISTICS_BILL',
          targetId: doc.id,
          amount,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to post 3PL payment'));
    });
  };

  const editLogisticsBill = async (doc: LogisticsBillRow) => {
    const result = await openPrompt({
      title: 'Edit 3PL Bill',
      fields: [
        { key: 'amount', label: '3PL bill amount', defaultValue: String(Number(doc.amount || 0)) },
        {
          key: 'dueDate',
          label: 'Due date (YYYY-MM-DD)',
          defaultValue: doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '',
          placeholder: 'optional',
        },
      ],
    });
    if (!result) return;
    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    await runAction(`EDIT_LOGISTICS_${doc.id}`, async () => {
      const res = await fetch(`/api/finance/logistics-bills?id=${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          dueDate: result.dueDate.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update 3PL bill'));
    });
  };

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
      <CardHeader>
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
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  No documents yet
                </TableCell>
              </TableRow>
            ) : (
              docs.map((doc) => {
                const actionKey = `PAY_${targetType}_${doc.id}`;
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.code}</TableCell>
                    <TableCell>{formatDate(doc.dueDate)}</TableCell>
                    <TableCell className="text-right">{money(doc.amount)}</TableCell>
                    <TableCell className="text-right">{money(doc.paid)}</TableCell>
                    <TableCell className="text-right">{money(doc.outstanding)}</TableCell>
                    <TableCell>{doc.status || 'OPEN'}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={doc.outstanding <= 0 || busyAction === actionKey}
                        onClick={() => payOutstanding(targetType, doc)}
                      >
                        {busyAction === actionKey ? 'Posting...' : 'Pay Outstanding'}
                      </Button>
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
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
          <SelectTrigger>
            <SelectValue placeholder="Select order (VPO)" />
          </SelectTrigger>
          <SelectContent>
            {orders.map((order) => (
              <SelectItem key={order.id} value={order.id}>
                {order.vpoNumber} | {order.workflowStatus || 'PO_UPLOADED'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'CREATE_TRANSIT_DOCS'}
          onClick={createTransitDocs}
        >
          {busyAction === 'CREATE_TRANSIT_DOCS' ? 'Creating...' : 'Auto Create AR+Vendor AP'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'CREATE_AR'}
          onClick={createAR}
        >
          {busyAction === 'CREATE_AR' ? 'Creating...' : 'Create AR'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'CREATE_VENDOR_AP'}
          onClick={createVendorAP}
        >
          {busyAction === 'CREATE_VENDOR_AP' ? 'Creating...' : 'Create Vendor AP'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'CREATE_LOGISTICS_AP'}
          onClick={createLogisticsAP}
        >
          {busyAction === 'CREATE_LOGISTICS_AP' ? 'Creating...' : 'Create 3PL AP (Manual)'}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <Select value={selectedContainerId || undefined} onValueChange={setSelectedContainerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select container for 3PL settlement" />
          </SelectTrigger>
          <SelectContent>
            {containers.map((container) => (
              <SelectItem key={container.id} value={container.id}>
                {container.containerNo} | {container.status || 'PLANNED'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
          3PL settlement is independent and container-based.
        </div>
      </div>

      {selectedOrder && (
        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
          Current Order:{' '}
          <span className="font-medium text-foreground">{selectedOrder.vpoNumber}</span> | Workflow:{' '}
          <span className="font-medium text-foreground">
            {selectedOrder.workflowStatus || 'PO_UPLOADED'}
          </span>{' '}
          | Sales:{' '}
          <span className="font-medium text-foreground">
            ${Number(selectedOrder.totalAmount || 0).toFixed(2)}
          </span>
        </div>
      )}

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Order Financial Summary (AR / AP)</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-medium">Customer AR</p>
              <p>Total: {money(summary.totals.receivable)}</p>
              <p>Paid: {money(summary.totals.receivablePaid)}</p>
              <p>Outstanding: {money(summary.totals.receivableOutstanding)}</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium">Total AP (Vendor + 3PL)</p>
              <p>Total: {money(apTotals.total)}</p>
              <p>Paid: {money(apTotals.paid)}</p>
              <p>Outstanding: {money(apTotals.outstanding)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <div className="text-sm text-muted-foreground">Loading financial data...</div>}

      {summary && (
        <div className="space-y-4">
          <DocTable
            title="Commercial Invoice (AR)"
            docs={summary.invoices}
            targetType="CUSTOMER_INVOICE"
          />
          <DocTable title="Vendor Bill (AP)" docs={summary.vendorBills} targetType="VENDOR_BILL" />
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">3PL Bill (AP) - Container Based</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill No</TableHead>
                    <TableHead>Container</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logisticsBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                        No 3PL bills for selected container
                      </TableCell>
                    </TableRow>
                  ) : (
                    logisticsBills.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.billNo}</TableCell>
                        <TableCell>
                          {containers.find((c) => c.id === doc.containerId)?.containerNo || '-'}
                        </TableCell>
                        <TableCell>{formatDate(doc.dueDate)}</TableCell>
                        <TableCell className="text-right">
                          {money(Number(doc.amount || 0))}
                        </TableCell>
                        <TableCell>{doc.status || 'OPEN'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyAction === `EDIT_LOGISTICS_${doc.id}`}
                              onClick={() => editLogisticsBill(doc)}
                            >
                              {busyAction === `EDIT_LOGISTICS_${doc.id}` ? 'Saving...' : 'Edit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyAction === `PAY_LOGISTICS_${doc.id}`}
                              onClick={() => payLogisticsBill(doc)}
                            >
                              {busyAction === `PAY_LOGISTICS_${doc.id}` ? 'Posting...' : 'Pay'}
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
      )}
      <PromptDialog {...promptDialogProps} />
    </div>
  );
}
