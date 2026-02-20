'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import { exportVendorExcel, exportVendorPdf } from '@/lib/vendor-po-export';
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

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
  }
  return res.json();
};

export function OrderWorkspace({ orderId }: { orderId: string }) {
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { openPrompt, promptDialogProps } = usePromptDialog();

  const [containerActionId, setContainerActionId] = useState(AUTO_CONTAINER);
  const [isPoPreviewOpen, setIsPoPreviewOpen] = useState(false);

  // SWR Hooks
  const { data: orderRes, error: orderError, isLoading: orderLoading, mutate: mutateOrder } = useSWR(`/api/orders/${orderId}`, fetcher);
  const { data: summaryRes, mutate: mutateSummary } = useSWR(`/api/finance/orders/${orderId}/summary`, fetcher);
  const { data: docsRes, mutate: mutateDocs } = useSWR(`/api/logistics/shipping-docs?orderId=${orderId}`, fetcher);
  const { data: allocRes, mutate: mutateAlloc } = useSWR(`/api/logistics/allocations?orderId=${orderId}`, fetcher);
  const { data: containerRes, mutate: mutateContainers } = useSWR('/api/logistics/containers', fetcher);
  const { data: timelineRes, mutate: mutateTimeline } = useSWR(`/api/orders/${orderId}/timeline`, fetcher);
  const { data: paymentsRes, mutate: mutatePayments } = useSWR(`/api/finance/payments?orderId=${orderId}`, fetcher);

  const error = orderError?.message || null;
  const loading = orderLoading;

  const order = useMemo(() => {
    if (!orderRes) return null;
    const normalizedOrder = orderRes as Partial<OrderDetails>;
    return {
      ...normalizedOrder,
      items: Array.isArray(normalizedOrder.items) ? normalizedOrder.items : [],
    } as OrderDetails;
  }, [orderRes]);

  const financeSummary = useMemo(() => {
    return summaryRes?.success ? (summaryRes.data as FinanceSummary) : makeEmptyFinanceSummary();
  }, [summaryRes]);

  const shippingDocs = useMemo(() => {
    return docsRes?.success && Array.isArray(docsRes.data) ? (docsRes.data as ShippingDocRow[]) : [];
  }, [docsRes]);

  const allocations = useMemo(() => {
    return allocRes?.success && Array.isArray(allocRes.data) ? (allocRes.data as AllocationRow[]) : [];
  }, [allocRes]);

  const containers = useMemo(() => {
    return containerRes?.success && Array.isArray(containerRes.data) ? (containerRes.data as ContainerRow[]) : [];
  }, [containerRes]);

  const timelineEvents = useMemo(() => {
    return timelineRes?.success && Array.isArray(timelineRes.data?.events)
      ? ((timelineRes.data as TimelineResponse).events as TimelineEvent[])
      : [];
  }, [timelineRes]);

  const payments = useMemo(() => {
    return paymentsRes?.success && Array.isArray(paymentsRes.data) ? (paymentsRes.data as PaymentRow[]) : [];
  }, [paymentsRes]);

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
    await Promise.all([
      mutateOrder(),
      mutateSummary(),
      mutateDocs(),
      mutateAlloc(),
      mutateContainers(),
      mutateTimeline(),
      mutatePayments(),
    ]);
  }, [
    mutateOrder,
    mutateSummary,
    mutateDocs,
    mutateAlloc,
    mutateContainers,
    mutateTimeline,
    mutatePayments,
  ]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
      await loadWorkspace();
    } catch (actionError: unknown) {
      const message = actionError instanceof Error ? actionError.message : 'Action failed';
      // Can't set global error easily now without a state for action errors, but we can alert or toast.
      // SWR handles fetch errors gracefully.
      alert(message);
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
      alert('Amount must be a valid number');
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
      alert('Payment amount must be a positive number');
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
      <div className="space-y-6 pb-20 animate-in fade-in duration-500">
        <div className="sticky top-0 z-10 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-background border-b shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between w-full items-center">
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-8 w-96" />
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-1 space-y-6">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="xl:col-span-3 space-y-6">
            <Skeleton className="h-12 w-full max-w-md rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
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

  return <div className="space-y-6 pb-20">
    {/* Header section with sticky support */}
    <div className="sticky top-0 z-10 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b shadow-sm">
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
    </div>

    {/* Main Content Area - Split Panel Concept */}
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

      {/* Left/Top Panel - Key Metrics & Timeline Summary */}
      <div className="xl:col-span-1 space-y-6">
        <Card className="shadow-sm border-muted/50 rounded-xl overflow-hidden">
          <CardHeader className="bg-muted/30 pb-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Value</CardTitle>
            <div className="text-3xl font-bold tracking-tight text-foreground">
              {money(num(order.totalAmount))}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Items</span>
              <span className="font-medium">{order.items?.reduce((sum, item) => sum + num(item.quantity?.toString() || '0'), 0) || 0} pcs</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-muted/50 rounded-xl">
          <CardHeader>
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Buyer</div>
              <div className="font-medium">{order.customerName || '—'}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Supplier</div>
              <div className="font-medium">{order.supplierName || '—'}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right/Main Panel - Tabbed Data Interface */}
      <div className="xl:col-span-3">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-6 bg-muted/50 p-1 rounded-xl w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="rounded-lg px-6">Overview</TabsTrigger>
            <TabsTrigger value="items" className="rounded-lg px-6">
              Line Items
              {order.items && order.items.length > 0 && (
                <Badge variant="secondary" className="ml-2 bg-background">{order.items.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="logistics" className="rounded-lg px-6">Logistics</TabsTrigger>
            <TabsTrigger value="finance" className="rounded-lg px-6">Finance</TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-lg px-6">Timeline</TabsTrigger>
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
          onDownloadExcel={() => exportVendorExcel(poData)}
          onDownloadPdf={() => exportVendorPdf(poData)}
        />
      </div>
    </div>
  </div>
}
