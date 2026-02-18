'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, formatDate, num } from '@/lib/format';
import { usePromptDialog, PromptDialog } from '@/components/ui/prompt-dialog';

interface OrderItem {
  id: string;
  productCode: string | null;
  description: string | null;
  quantity: number | null;
  customerUnitPrice: string | null;
  vendorUnitPrice: string | null;
  total: string | null;
  tariffRate: string | null;
  estimatedDutyCost: string | null;
  estimated3plCost: string | null;
  estimatedMargin: string | null;
  collection: string | null;
  material: string | null;
}

interface OrderDetails {
  id: string;
  vpoNumber: string;
  soReference: string | null;
  customerName: string | null;
  supplierName: string | null;
  shipTo: string | null;
  shipVia: string | null;
  orderDate: string | null;
  expShipDate: string | null;
  paymentTerms: string | null;
  workflowStatus: string | null;
  totalAmount: string | null;
  estimatedMargin: string | null;
  estimatedMarginRate: string | null;
  deliveredAt: string | null;
  closedAt: string | null;
  items: OrderItem[];
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

interface ShippingDocRow {
  id: string;
  docNo: string;
  containerId: string | null;
  issueDate: string | null;
  status: string | null;
}

interface AllocationRow {
  id: string;
  containerId: string;
  allocatedQty: number | null;
  allocatedAmount: string | null;
  createdAt: string | null;
}

interface ContainerRow {
  id: string;
  containerNo: string;
  vesselName: string | null;
  status: string | null;
  atd: string | null;
  eta: string | null;
  ata: string | null;
  arrivalAtWarehouse: string | null;
}

interface TimelineEvent {
  id: string;
  at: string | null;
  type: string;
  title: string;
  description: string | null;
  status: string | null;
  entityType: string;
  entityId: string;
  amount: number | null;
}

interface TimelineResponse {
  events: TimelineEvent[];
}

interface PaymentRow {
  id: string;
  targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL';
  targetId: string;
  targetCode?: string;
  direction: 'IN' | 'OUT';
  amount: string | null;
  paymentDate: string | null;
  method: string | null;
  referenceNo: string | null;
  notes: string | null;
}

type WorkflowAction = 'GENERATE_SHIPPING_DOC' | 'START_TRANSIT' | 'MARK_DELIVERED';
type RollbackAction = 'UNDO_MARK_DELIVERED' | 'UNDO_START_TRANSIT' | 'UNDO_SHIPPING_DOC';

const AUTO_CONTAINER = 'AUTO';



function statusBadgeVariant(
  status: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'CLOSED' || normalized === 'PAID') return 'default';
  if (normalized === 'AR_AP_OPEN' || normalized === 'PARTIAL') return 'secondary';
  if (normalized === 'OPEN' || normalized === 'IN_TRANSIT') return 'outline';
  if (normalized.includes('ERROR')) return 'destructive';
  return 'outline';
}

function makeEmptyFinanceSummary(): FinanceSummary {
  return {
    invoices: [],
    vendorBills: [],
    logisticsBills: [],
    totals: {
      receivable: 0,
      receivablePaid: 0,
      receivableOutstanding: 0,
      vendorPayable: 0,
      vendorPaid: 0,
      vendorOutstanding: 0,
      logisticsPayable: 0,
      logisticsPaid: 0,
      logisticsOutstanding: 0,
    },
  };
}

function nextStepHints(
  order: OrderDetails | null,
  shippingDocs: ShippingDocRow[],
  allocations: AllocationRow[],
  summary: FinanceSummary | null
) {
  if (!order) return [];
  const hints: string[] = [];
  if (allocations.length === 0) {
    hints.push('Allocate this order to at least one container (optional now, recommended before transit).');
  }
  if (shippingDocs.length === 0) {
    hints.push('Send shipping document to create 3PL shipment instruction.');
  }
  if (!summary || summary.invoices.length === 0) {
    hints.push('Open customer AR (commercial invoice).');
  }
  if (!summary || summary.vendorBills.length === 0) {
    hints.push('Open factory AP (vendor bill).');
  }
  if (order.deliveredAt && (!summary || summary.logisticsBills.length === 0)) {
    hints.push('Open 3PL AP after warehouse delivery.');
  }
  if (summary) {
    const outstanding =
      summary.totals.receivableOutstanding +
      summary.totals.vendorOutstanding +
      summary.totals.logisticsOutstanding;
    if (outstanding > 0) {
      hints.push('Post remaining payments to move order to CLOSED automatically.');
    }
  }
  if (hints.length === 0) {
    hints.push('No pending action. Workflow is complete or fully up to date.');
  }
  return hints;
}

export function OrderWorkspace({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { openPrompt, promptDialogProps } = usePromptDialog();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [financeSummary, setFinanceSummary] = useState<FinanceSummary | null>(null);
  const [shippingDocs, setShippingDocs] = useState<ShippingDocRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [containerActionId, setContainerActionId] = useState(AUTO_CONTAINER);

  const containerMap = useMemo(() => {
    return new Map(containers.map((container) => [container.id, container]));
  }, [containers]);

  const relevantContainerOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const row of allocations) ids.add(row.containerId);
    for (const row of shippingDocs) {
      if (row.containerId) ids.add(row.containerId);
    }

    if (ids.size === 0) return containers;

    const selected = containers.filter((container) => ids.has(container.id));
    return selected.length > 0 ? selected : containers;
  }, [allocations, shippingDocs, containers]);

  useEffect(() => {
    if (
      containerActionId !== AUTO_CONTAINER &&
      !relevantContainerOptions.some((container) => container.id === containerActionId)
    ) {
      setContainerActionId(AUTO_CONTAINER);
    }
  }, [containerActionId, relevantContainerOptions]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orderRes, summaryRes, docsRes, allocRes, containerRes, timelineRes, paymentsRes] = await Promise.all([
        fetch(`/api/orders/${orderId}`, { cache: 'no-store' }),
        fetch(`/api/finance/orders/${orderId}/summary`, { cache: 'no-store' }),
        fetch(`/api/logistics/shipping-docs?orderId=${orderId}`, { cache: 'no-store' }),
        fetch(`/api/logistics/allocations?orderId=${orderId}`, { cache: 'no-store' }),
        fetch('/api/logistics/containers', { cache: 'no-store' }),
        fetch(`/api/orders/${orderId}/timeline`, { cache: 'no-store' }),
        fetch(`/api/finance/payments?orderId=${orderId}`, { cache: 'no-store' }),
      ]);

      const [orderJson, summaryJson, docsJson, allocJson, containerJson, timelineJson, paymentsJson] =
        await Promise.all([
          orderRes.json().catch(() => ({})),
          summaryRes.json().catch(() => ({})),
          docsRes.json().catch(() => ({})),
          allocRes.json().catch(() => ({})),
          containerRes.json().catch(() => ({})),
          timelineRes.json().catch(() => ({})),
          paymentsRes.json().catch(() => ({})),
        ]);

      if (!orderRes.ok) {
        throw new Error(orderJson.error || 'Failed to load order');
      }

      const normalizedOrder = orderJson as Partial<OrderDetails>;
      setOrder({
        ...normalizedOrder,
        items: Array.isArray(normalizedOrder.items) ? normalizedOrder.items : [],
      } as OrderDetails);
      setFinanceSummary(
        summaryRes.ok && summaryJson.success
          ? (summaryJson.data as FinanceSummary)
          : makeEmptyFinanceSummary()
      );
      setShippingDocs(
        docsRes.ok && docsJson.success && Array.isArray(docsJson.data)
          ? (docsJson.data as ShippingDocRow[])
          : []
      );
      setAllocations(
        allocRes.ok && allocJson.success && Array.isArray(allocJson.data)
          ? (allocJson.data as AllocationRow[])
          : []
      );
      setContainers(
        containerRes.ok && containerJson.success && Array.isArray(containerJson.data)
          ? (containerJson.data as ContainerRow[])
          : []
      );
      setTimelineEvents(
        timelineRes.ok && timelineJson.success && Array.isArray(timelineJson.data?.events)
          ? ((timelineJson.data as TimelineResponse).events as TimelineEvent[])
          : []
      );
      setPayments(
        paymentsRes.ok && paymentsJson.success && Array.isArray(paymentsJson.data)
          ? (paymentsJson.data as PaymentRow[])
          : []
      );
    } catch (loadError: unknown) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load workspace';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
      await loadWorkspace();
    } catch (actionError: unknown) {
      const message = actionError instanceof Error ? actionError.message : 'Action failed';
      setError(message);
    } finally {
      setBusyAction(null);
    }
  };

  const readError = async (res: Response, fallback: string) => {
    const payload = await res.json().catch(() => ({}));
    return payload?.error || fallback;
  };

  const triggerWorkflow = async (action: WorkflowAction) => {
    await runAction(action, async () => {
      const res = await fetch(`/api/workflow/orders/${orderId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          containerId: containerActionId === AUTO_CONTAINER ? undefined : containerActionId,
        }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, 'Failed to trigger workflow'));
      }
    });
  };

  const createAr = async () => {
    await runAction('CREATE_AR', async () => {
      const res = await fetch('/api/finance/commercial-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to create AR'));
    });
  };

  const createVendorAp = async () => {
    await runAction('CREATE_VENDOR_AP', async () => {
      const res = await fetch('/api/finance/vendor-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to create vendor AP'));
    });
  };

  const createLogisticsAp = async () => {
    await runAction('CREATE_LOGISTICS_AP', async () => {
      const res = await fetch('/api/finance/logistics-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, containerId: containerActionId === AUTO_CONTAINER ? undefined : containerActionId }),
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
      const res = await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          targetId: doc.id,
          amount: doc.outstanding,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to post payment'));
    });
  };

  const deleteShippingDoc = async (id: string) => {
    await runAction(`DELETE_SHIPPING_DOC_${id}`, async () => {
      const res = await fetch(`/api/logistics/shipping-docs?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete shipping doc'));
    });
  };

  const deleteAllocation = async (id: string) => {
    await runAction(`DELETE_ALLOCATION_${id}`, async () => {
      const res = await fetch(`/api/logistics/allocations?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete allocation'));
    });
  };

  const deleteFinanceDoc = async (
    targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
    id: string
  ) => {
    const routeMap: Record<'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL', string> = {
      CUSTOMER_INVOICE: '/api/finance/commercial-invoices',
      VENDOR_BILL: '/api/finance/vendor-bills',
      LOGISTICS_BILL: '/api/finance/logistics-bills',
    };
    await runAction(`DELETE_DOC_${targetType}_${id}`, async () => {
      const res = await fetch(`${routeMap[targetType]}?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete document'));
    });
  };

  const deletePayment = async (id: string) => {
    await runAction(`DELETE_PAYMENT_${id}`, async () => {
      const res = await fetch(`/api/finance/payments?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete payment'));
    });
  };

  const editShippingDoc = async (row: ShippingDocRow) => {
    const result = await openPrompt({
      title: 'Edit Shipping Document',
      fields: [
        { key: 'status', label: 'Status', defaultValue: row.status || 'ISSUED' },
        { key: 'issueDate', label: 'Issue date (YYYY-MM-DD)', defaultValue: row.issueDate ? new Date(row.issueDate).toISOString().slice(0, 10) : '', placeholder: 'empty to clear' },
      ],
    });
    if (!result) return;

    await runAction(`EDIT_SHIPPING_DOC_${row.id}`, async () => {
      const res = await fetch(`/api/logistics/shipping-docs?id=${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: result.status.trim(),
          issueDate: result.issueDate.trim() ? result.issueDate.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update shipping doc'));
    });
  };

  const editAllocation = async (row: AllocationRow) => {
    const result = await openPrompt({
      title: 'Edit Allocation',
      fields: [
        { key: 'qty', label: 'Allocated Qty', defaultValue: row.allocatedQty !== null ? String(row.allocatedQty) : '', placeholder: 'empty to clear' },
        { key: 'amount', label: 'Allocated Amount', defaultValue: row.allocatedAmount || '', placeholder: 'empty to clear' },
      ],
    });
    if (!result) return;

    await runAction(`EDIT_ALLOCATION_${row.id}`, async () => {
      const res = await fetch(`/api/logistics/allocations?id=${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allocatedQty: result.qty.trim() ? result.qty.trim() : null,
          allocatedAmount: result.amount.trim() ? result.amount.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update allocation'));
    });
  };

  const editFinanceDoc = async (
    targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL',
    doc: DocSummary
  ) => {
    const result = await openPrompt({
      title: 'Edit Document',
      fields: [
        { key: 'amount', label: 'Amount', defaultValue: String(doc.amount) },
        { key: 'dueDate', label: 'Due date (YYYY-MM-DD)', defaultValue: doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '', placeholder: 'empty to clear' },
      ],
    });
    if (!result) return;

    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Amount must be a valid number');
      return;
    }

    const routeMap: Record<'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL', string> = {
      CUSTOMER_INVOICE: '/api/finance/commercial-invoices',
      VENDOR_BILL: '/api/finance/vendor-bills',
      LOGISTICS_BILL: '/api/finance/logistics-bills',
    };

    await runAction(`EDIT_DOC_${targetType}_${doc.id}`, async () => {
      const res = await fetch(`${routeMap[targetType]}?id=${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          dueDate: result.dueDate.trim() ? result.dueDate.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update document'));
    });
  };

  const editPayment = async (row: PaymentRow) => {
    const result = await openPrompt({
      title: 'Edit Payment',
      fields: [
        { key: 'amount', label: 'Payment amount', defaultValue: String(num(row.amount)) },
        { key: 'date', label: 'Payment date (YYYY-MM-DD)', defaultValue: row.paymentDate ? new Date(row.paymentDate).toISOString().slice(0, 10) : '', placeholder: 'empty to clear' },
        { key: 'method', label: 'Method', defaultValue: row.method || '', placeholder: 'optional' },
      ],
    });
    if (!result) return;

    const amount = Number(result.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Payment amount must be a positive number');
      return;
    }

    await runAction(`EDIT_PAYMENT_${row.id}`, async () => {
      const res = await fetch(`/api/finance/payments?id=${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentDate: result.date.trim() ? result.date.trim() : null,
          method: result.method.trim() ? result.method.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to update payment'));
    });
  };

  const rollbackWorkflow = async (action: RollbackAction, message: string) => {
    const ok = window.confirm(message);
    if (!ok) return;

    await runAction(action, async () => {
      const res = await fetch(`/api/workflow/orders/${orderId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to rollback step'));
    });
  };

  const itemTotals = useMemo(() => {
    const items = order?.items || [];
    return {
      qty: items.reduce((sum, item) => sum + num(item.quantity), 0),
      revenue: items.reduce((sum, item) => sum + num(item.total), 0),
      vendorCost: items.reduce((sum, item) => sum + num(item.vendorUnitPrice) * num(item.quantity), 0),
      duty: items.reduce((sum, item) => sum + num(item.estimatedDutyCost), 0),
      est3pl: items.reduce((sum, item) => sum + num(item.estimated3plCost), 0),
      margin: items.reduce((sum, item) => sum + num(item.estimatedMargin), 0),
    };
  }, [order]);

  const hints = useMemo(
    () => nextStepHints(order, shippingDocs, allocations, financeSummary),
    [order, shippingDocs, allocations, financeSummary]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading workspace...</div>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
        <Link href="/dashboard" className="text-sm underline underline-offset-2">
          Back to dashboard
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Order not found.
      </div>
    );
  }

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
                      <Badge variant={statusBadgeVariant(doc.status)}>{doc.status || 'OPEN'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyAction === editKey}
                          onClick={() => editFinanceDoc(targetType, doc)}
                        >
                          {busyAction === editKey ? 'Saving...' : 'Edit'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={doc.outstanding <= 0 || busyAction === actionKey}
                          onClick={() => payOutstanding(targetType, doc)}
                        >
                          {busyAction === actionKey ? 'Posting...' : 'Pay'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyAction === deleteKey}
                          onClick={() => deleteFinanceDoc(targetType, doc.id)}
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
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                Order Workspace: {order.vpoNumber}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>SO: {order.soReference || '-'}</span>
                <span>Customer: {order.customerName || '-'}</span>
                <span>Supplier: {order.supplierName || '-'}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={statusBadgeVariant(order.workflowStatus)}>
                {order.workflowStatus || 'PO_UPLOADED'}
              </Badge>
              <Badge variant="outline">Sales {money(num(order.totalAmount))}</Badge>
              <Badge variant="outline">Est Margin {money(num(order.estimatedMargin))}</Badge>
              <Badge variant="outline">
                Est Margin Rate {(num(order.estimatedMarginRate) * 100).toFixed(2)}%
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr]">
            <Select value={containerActionId} onValueChange={setContainerActionId}>
              <SelectTrigger>
                <SelectValue placeholder="Container for action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_CONTAINER}>Auto resolve container</SelectItem>
                {relevantContainerOptions.map((container) => (
                  <SelectItem key={container.id} value={container.id}>
                    {container.containerNo} | {container.status || 'PLANNED'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              disabled={busyAction === 'GENERATE_SHIPPING_DOC'}
              onClick={() => triggerWorkflow('GENERATE_SHIPPING_DOC')}
            >
              {busyAction === 'GENERATE_SHIPPING_DOC' ? 'Working...' : 'Send Shipping Doc'}
            </Button>
            <Button
              variant="outline"
              disabled={busyAction === 'START_TRANSIT'}
              onClick={() => triggerWorkflow('START_TRANSIT')}
            >
              {busyAction === 'START_TRANSIT' ? 'Working...' : 'Start Transit'}
            </Button>
            <Button
              variant="outline"
              disabled={busyAction === 'MARK_DELIVERED'}
              onClick={() => triggerWorkflow('MARK_DELIVERED')}
            >
              {busyAction === 'MARK_DELIVERED' ? 'Working...' : 'Mark Delivered'}
            </Button>
            <Button
              variant="outline"
              disabled={busyAction === 'REFRESH'}
              onClick={() => runAction('REFRESH', async () => { })}
            >
              {busyAction === 'REFRESH' ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Back Dashboard</Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Rollback:</span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyAction === 'UNDO_MARK_DELIVERED'}
              onClick={() =>
                rollbackWorkflow(
                  'UNDO_MARK_DELIVERED',
                  'Undo delivered step? This will remove 3PL AP and related payments.'
                )
              }
            >
              {busyAction === 'UNDO_MARK_DELIVERED' ? 'Working...' : 'Undo Delivered'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyAction === 'UNDO_START_TRANSIT'}
              onClick={() =>
                rollbackWorkflow(
                  'UNDO_START_TRANSIT',
                  'Undo transit step? This will remove AR/AP docs and related payments.'
                )
              }
            >
              {busyAction === 'UNDO_START_TRANSIT' ? 'Working...' : 'Undo Transit'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busyAction === 'UNDO_SHIPPING_DOC'}
              onClick={() =>
                rollbackWorkflow(
                  'UNDO_SHIPPING_DOC',
                  'Undo shipping doc step? This removes shipping docs plus downstream finance documents and payments.'
                )
              }
            >
              {busyAction === 'UNDO_SHIPPING_DOC' ? 'Working...' : 'Undo Shipping Doc'}
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </CardHeader>
      </Card>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items & Margin</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
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
                  <div key={`${hint}-${index}`} className="rounded-md border bg-muted/30 p-2 text-xs">
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
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Line Items and Estimated Margin</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                        No items found
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {order.items.map((item) => {
                        const qty = num(item.quantity);
                        const customerUnit = num(item.customerUnitPrice);
                        const vendorUnit = num(item.vendorUnitPrice);
                        const margin = num(item.estimatedMargin);
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.productCode || '-'}</TableCell>
                            <TableCell>{item.description || '-'}</TableCell>
                            <TableCell>{item.collection || '-'}</TableCell>
                            <TableCell>{item.material || '-'}</TableCell>
                            <TableCell className="text-right">{qty}</TableCell>
                            <TableCell className="text-right">{money(customerUnit)}</TableCell>
                            <TableCell className="text-right">{money(vendorUnit)}</TableCell>
                            <TableCell className="text-right">{money(num(item.estimatedDutyCost))}</TableCell>
                            <TableCell className="text-right">{money(num(item.estimated3plCost))}</TableCell>
                            <TableCell className="text-right">
                              <span className={margin >= 0 ? 'text-emerald-600' : 'text-destructive'}>
                                {money(margin)}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell colSpan={4}>Totals</TableCell>
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
        </TabsContent>

        <TabsContent value="logistics" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Shipping Documents</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Doc No</TableHead>
                    <TableHead>Container</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shippingDocs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No shipping document yet
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
                          <Badge variant={statusBadgeVariant(row.status)}>{row.status || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyAction === `EDIT_SHIPPING_DOC_${row.id}`}
                              onClick={() => editShippingDoc(row)}
                            >
                              {busyAction === `EDIT_SHIPPING_DOC_${row.id}` ? 'Saving...' : 'Edit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyAction === `DELETE_SHIPPING_DOC_${row.id}`}
                              onClick={() => deleteShippingDoc(row.id)}
                            >
                              {busyAction === `DELETE_SHIPPING_DOC_${row.id}` ? 'Deleting...' : 'Delete'}
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
              <CardTitle className="text-sm">Container Allocations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Container</TableHead>
                    <TableHead className="text-right">Allocated Qty</TableHead>
                    <TableHead className="text-right">Allocated Amount</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allocations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                        No allocations yet
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
                              onClick={() => editAllocation(row)}
                            >
                              {busyAction === `EDIT_ALLOCATION_${row.id}` ? 'Saving...' : 'Edit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyAction === `DELETE_ALLOCATION_${row.id}`}
                              onClick={() => deleteAllocation(row.id)}
                            >
                              {busyAction === `DELETE_ALLOCATION_${row.id}` ? 'Deleting...' : 'Delete'}
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
              <CardTitle className="text-sm">Related Containers</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Container</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ATD</TableHead>
                    <TableHead>ETA</TableHead>
                    <TableHead>Arrival WH</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relevantContainerOptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        No linked container
                      </TableCell>
                    </TableRow>
                  ) : (
                    relevantContainerOptions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.containerNo}</TableCell>
                        <TableCell>{row.vesselName || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(row.status)}>{row.status || '-'}</Badge>
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
        </TabsContent>

        <TabsContent value="finance" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Button
              variant="outline"
              disabled={busyAction === 'CREATE_AR'}
              onClick={createAr}
            >
              {busyAction === 'CREATE_AR' ? 'Creating...' : 'Create AR'}
            </Button>
            <Button
              variant="outline"
              disabled={busyAction === 'CREATE_VENDOR_AP'}
              onClick={createVendorAp}
            >
              {busyAction === 'CREATE_VENDOR_AP' ? 'Creating...' : 'Create Vendor AP'}
            </Button>
            <Button
              variant="outline"
              disabled={busyAction === 'CREATE_LOGISTICS_AP'}
              onClick={createLogisticsAp}
            >
              {busyAction === 'CREATE_LOGISTICS_AP' ? 'Creating...' : 'Create 3PL AP'}
            </Button>
          </div>

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
                              onClick={() => editPayment(row)}
                            >
                              {busyAction === `EDIT_PAYMENT_${row.id}` ? 'Saving...' : 'Edit'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busyAction === `DELETE_PAYMENT_${row.id}`}
                              onClick={() => deletePayment(row.id)}
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
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Order Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {timelineEvents.length === 0 ? (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  No timeline event yet.
                </div>
              ) : (
                timelineEvents.map((event, index) => (
                  <div key={event.id} className="grid grid-cols-[140px_1fr] gap-3 rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">
                      <div>{event.at ? new Date(event.at).toLocaleDateString() : '-'}</div>
                      <div>{event.at ? new Date(event.at).toLocaleTimeString() : '-'}</div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{event.title}</span>
                        <Badge variant="outline">{event.entityType}</Badge>
                        {event.status && (
                          <Badge variant={statusBadgeVariant(event.status)}>{event.status}</Badge>
                        )}
                        {event.amount !== null && (
                          <Badge variant="secondary">{money(num(event.amount))}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {event.description || 'No description'}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Event #{index + 1} | {event.type}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <PromptDialog {...promptDialogProps} />
    </div>
  );
}
