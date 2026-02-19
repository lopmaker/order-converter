'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { money, formatDate, num } from '@/lib/format';
import { usePromptDialog, PromptDialog } from '@/components/ui/prompt-dialog';
import { PoPreviewDialog } from '@/components/po-preview/po-preview-dialog';
import { ExtractedOrderData } from '@/lib/parser';
import { Download, FileText, Printer } from 'lucide-react';
import {
  OrderItem,
  OrderDetails,
  DocSummary,
  FinanceSummary,
  ShippingDocRow,
  AllocationRow,
  ContainerRow,
  TimelineEvent,
  TimelineResponse,
  PaymentRow,
  WorkflowAction,
  RollbackAction,
  AUTO_CONTAINER,
} from './workspace/types';

import {
  statusBadgeVariant,
  makeEmptyFinanceSummary,
  nextStepHints,
} from './workspace/utils';

import { OverviewTab } from './workspace/tabs/overview-tab';
import { ItemsTab } from './workspace/tabs/items-tab';
import { LogisticsTab } from './workspace/tabs/logistics-tab';
import { FinanceTab } from './workspace/tabs/finance-tab';
import { TimelineTab } from './workspace/tabs/timeline-tab';
import { OrderHeader } from './workspace/order-header';

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
  const [isPoPreviewOpen, setIsPoPreviewOpen] = useState(false);

  const poData: ExtractedOrderData = useMemo(() => {
    if (!order) return { items: [] };
    return {
      vpoNumber: order.vpoNumber,
      orderDate: formatDate(order.orderDate),
      expShipDate: formatDate(order.expShipDate),
      cancelDate: formatDate(order.cancelDate),
      soReference: order.soReference || undefined,
      customerName: order.customerName || undefined,
      customerAddress: order.customerAddress || undefined,
      supplierName: order.supplierName || undefined,
      supplierAddress: order.supplierAddress || undefined,
      shipTo: order.shipTo || undefined,
      shipVia: order.shipVia || undefined,
      shipmentTerms: order.shipmentTerms || undefined,
      paymentTerms: order.paymentTerms || undefined,
      agent: order.agent || undefined,
      items: (order.items || []).map((item) => ({
        productCode: item.productCode || '',
        description: item.description || '',
        totalQty: num(item.quantity),
        unitPrice: num(item.vendorUnitPrice),
        extension: num(item.quantity) * num(item.vendorUnitPrice),
        color: item.collection || undefined,
      })),
    };
  }, [order]);

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
      const [orderRes, summaryRes, docsRes, allocRes, containerRes, timelineRes, paymentsRes] =
        await Promise.all([
          fetch(`/api/orders/${orderId}`, { cache: 'no-store' }),
          fetch(`/api/finance/orders/${orderId}/summary`, { cache: 'no-store' }),
          fetch(`/api/logistics/shipping-docs?orderId=${orderId}`, { cache: 'no-store' }),
          fetch(`/api/logistics/allocations?orderId=${orderId}`, { cache: 'no-store' }),
          fetch('/api/logistics/containers', { cache: 'no-store' }),
          fetch(`/api/orders/${orderId}/timeline`, { cache: 'no-store' }),
          fetch(`/api/finance/payments?orderId=${orderId}`, { cache: 'no-store' }),
        ]);

      const [
        orderJson,
        summaryJson,
        docsJson,
        allocJson,
        containerJson,
        timelineJson,
        paymentsJson,
      ] = await Promise.all([
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
        body: JSON.stringify({
          orderId,
          containerId: containerActionId === AUTO_CONTAINER ? undefined : containerActionId,
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
        {
          key: 'issueDate',
          label: 'Issue date (YYYY-MM-DD)',
          defaultValue: row.issueDate ? new Date(row.issueDate).toISOString().slice(0, 10) : '',
          placeholder: 'empty to clear',
        },
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
        {
          key: 'qty',
          label: 'Allocated Qty',
          defaultValue: row.allocatedQty !== null ? String(row.allocatedQty) : '',
          placeholder: 'empty to clear',
        },
        {
          key: 'amount',
          label: 'Allocated Amount',
          defaultValue: row.allocatedAmount || '',
          placeholder: 'empty to clear',
        },
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
        {
          key: 'dueDate',
          label: 'Due date (YYYY-MM-DD)',
          defaultValue: doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '',
          placeholder: 'empty to clear',
        },
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
        {
          key: 'date',
          label: 'Payment date (YYYY-MM-DD)',
          defaultValue: row.paymentDate ? new Date(row.paymentDate).toISOString().slice(0, 10) : '',
          placeholder: 'empty to clear',
        },
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

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedItems(next);
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
      vendorCost: items.reduce(
        (sum, item) => sum + num(item.vendorUnitPrice) * num(item.quantity),
        0
      ),
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
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          Loading workspace...
        </div>
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
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">Order not found.</div>
    );
  }

  return (
    <div className="space-y-4">
      <OrderHeader
        order={order}
        relevantContainerOptions={relevantContainerOptions}
        selectedContainerForWorkflow={containerActionId}
        setSelectedContainerForWorkflow={setContainerActionId}
        busyAction={busyAction}
        actions={{
          setIsPoPreviewOpen,
          triggerWorkflow,
          rollbackWorkflow,
        }}
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items & Margin</TabsTrigger>
          <TabsTrigger value="logistics">Logistics</TabsTrigger>
          <TabsTrigger value="finance">Finance</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            order={order}
            hints={hints}
            shippingDocs={shippingDocs}
            allocations={allocations}
            financeSummary={financeSummary}
          />
        </TabsContent>

        <TabsContent value="items">
          <ItemsTab order={order} />
        </TabsContent>

        <TabsContent value="logistics">
          <LogisticsTab
            shippingDocs={shippingDocs}
            allocations={allocations}
            relevantContainerOptions={relevantContainerOptions}
            containerMap={containerMap}
            busyAction={busyAction}
            actions={{
              editShippingDoc,
              deleteShippingDoc,
              editAllocation,
              deleteAllocation,
            }}
          />
        </TabsContent>

        <TabsContent value="finance">
          <FinanceTab
            financeSummary={financeSummary}
            payments={payments}
            busyAction={busyAction}
            actions={{
              createAr,
              createVendorAp,
              createLogisticsAp,
              editFinanceDoc,
              payOutstanding,
              deleteFinanceDoc,
              editPayment,
              deletePayment,
            }}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab events={timelineEvents} />
        </TabsContent>
      </Tabs>

      <PromptDialog {...promptDialogProps} />
      <PoPreviewDialog
        open={isPoPreviewOpen}
        onOpenChange={setIsPoPreviewOpen}
        data={poData}
      />
    </div>
  );
}
