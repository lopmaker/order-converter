'use client';

import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Loader2, Pencil, Save, X, ChevronDown, ChevronUp } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useI18n } from '@/components/locale-provider';

import { type SerializedOrder, type OrderItem, type OrderWithItems } from '@/lib/types';

interface OrdersTableProps {
  initialOrders: SerializedOrder[];
  initialHasMore: boolean;
  pageSize: number;
}

type WorkflowAction = 'GENERATE_SHIPPING_DOC' | 'START_TRANSIT' | 'MARK_DELIVERED';

export function OrdersTable({ initialOrders, initialHasMore, pageSize }: OrdersTableProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [orders, setOrders] = useState<SerializedOrder[]>(initialOrders);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const loadMoreOrders = async () => {
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(`/api/orders?page=${nextPage}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to fetch more orders');
      const data: { orders: SerializedOrder[]; hasMore: boolean } = await res.json();

      setOrders((prevOrders) => [...prevOrders, ...data.orders]);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (error) {
      console.error('Failed to load more orders:', error);
      alert(t('OrdersTable.loadMoreFailed', 'Failed to load more orders.'));
    } finally {
      setLoadingMore(false);
    }
  };

  // Expanded row state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedData, setExpandedData] = useState<OrderWithItems | null>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<SerializedOrder>>({});

  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [workflowLoading, setWorkflowLoading] = useState<WorkflowAction | null>(null);

  // Confirm Dialog State
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // --- Toggle Expand ---
  const loadOrderDetails = async (id: string) => {
    const res = await fetch(`/api/orders/${id}`);
    if (!res.ok) throw new Error('Failed to fetch');
    const data = await res.json();
    setExpandedData(data);
    return data as OrderWithItems;
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      // Collapse
      setExpandedId(null);
      setExpandedData(null);
      setEditMode(false);
      return;
    }

    setExpandedId(id);
    setExpandLoading(true);
    setEditMode(false);
    try {
      await loadOrderDetails(id);
    } catch (err) {
      console.error('Expand error:', err);
      setExpandedData(null);
    } finally {
      setExpandLoading(false);
    }
  };

  const triggerWorkflow = async (action: WorkflowAction) => {
    if (!expandedId) return;
    setWorkflowLoading(action);
    try {
      const res = await fetch(`/api/workflow/orders/${expandedId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload.error || t('OrdersTable.workflowTriggerFailed', 'Failed to trigger workflow')
        );
      }

      const nextStatus = payload?.data?.updated?.workflowStatus;
      if (typeof nextStatus === 'string') {
        setOrders((prev) =>
          prev.map((order) =>
            order.id === expandedId ? { ...order, workflowStatus: nextStatus } : order
          )
        );
      }
      await loadOrderDetails(expandedId);
      router.refresh();
    } catch (err) {
      console.error('Workflow trigger error:', err);
      alert(
        err instanceof Error
          ? err.message
          : t('OrdersTable.workflowTriggerFailed', 'Failed to trigger workflow')
      );
    } finally {
      setWorkflowLoading(null);
    }
  };

  // --- Edit ---
  const startEdit = () => {
    if (!expandedData) return;
    setEditData({
      vpoNumber: expandedData.vpoNumber,
      soReference: expandedData.soReference,
      customerName: expandedData.customerName,
      customerAddress: expandedData.customerAddress,
      supplierName: expandedData.supplierName,
      supplierAddress: expandedData.supplierAddress,
      orderDate: expandedData.orderDate,
      expShipDate: expandedData.expShipDate,
      cancelDate: expandedData.cancelDate,
      shipTo: expandedData.shipTo,
      shipVia: expandedData.shipVia,
      shipmentTerms: expandedData.shipmentTerms,
      paymentTerms: expandedData.paymentTerms,
      workflowStatus: expandedData.workflowStatus,
      totalAmount: expandedData.totalAmount,
    });
    setEditItems(expandedData.items ? expandedData.items.map((i) => ({ ...i })) : []);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditData({});
    setEditItems([]);
  };

  const saveEdit = async () => {
    if (!expandedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${expandedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editData, items: editItems }),
      });
      if (!res.ok) throw new Error('Failed to save');

      // Update local state
      setOrders((prev) => prev.map((o) => (o.id === expandedId ? { ...o, ...editData } : o)));
      setExpandedData((prev) => (prev ? { ...prev, ...editData, items: editItems } : prev));
      setEditMode(false);
      setEditItems([]);
      router.refresh();
    } catch (err) {
      console.error('Save error:', err);
      alert(t('OrdersTable.saveFailed', 'Failed to save changes'));
    } finally {
      setSaving(false);
    }
  };

  // --- Delete ---
  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setLoadingId(deleteId);
    try {
      const res = await fetch(`/api/orders/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setOrders((prev) => prev.filter((o) => o.id !== deleteId));
      if (expandedId === deleteId) {
        setExpandedId(null);
        setExpandedData(null);
      }
      router.refresh();
    } catch (error) {
      console.error('Delete failed:', error);
      alert(t('OrdersTable.deleteFailed', 'Failed to delete order'));
    } finally {
      setLoadingId(null);
      setConfirmOpen(false);
      setDeleteId(null);
    }
  };

  // --- Helper: edit field ---
  const editField = (key: keyof SerializedOrder, value: string) => {
    setEditData((prev) => ({ ...prev, [key]: value }));
  };

  const editItemField = (index: number, key: keyof OrderItem, value: string) => {
    setEditItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [key]: key === 'quantity' ? parseInt(value) || 0 : value } : item
      )
    );
  };

  // Column count for expanded row
  const colCount = 12;

  if (orders.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        {t(
          'OrdersTable.noOrders',
          'No orders found. Connect the database and save an order to see it here.'
        )}
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>{t('OrdersTable.vpoNumber', 'VPO Number')}</TableHead>
              <TableHead>{t('OrdersTable.soRef', 'SO Ref')}</TableHead>
              <TableHead>{t('OrdersTable.customer', 'Customer')}</TableHead>
              <TableHead>{t('OrdersTable.supplier', 'Supplier')}</TableHead>
              <TableHead>{t('OrdersTable.orderDate', 'Order Date')}</TableHead>
              <TableHead>{t('OrdersTable.expShip', 'Exp Ship')}</TableHead>
              <TableHead>{t('OrdersTable.shipTo', 'Ship To')}</TableHead>
              <TableHead>{t('OrdersTable.payment', 'Payment')}</TableHead>
              <TableHead>{t('OrdersTable.workflow', 'Workflow')}</TableHead>
              <TableHead className="text-right">{t('OrdersTable.amount', 'Amount')}</TableHead>
              <TableHead className="w-[150px]">{t('OrdersTable.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <Fragment key={order.id}>
                <TableRow key={order.id} className={expandedId === order.id ? 'bg-muted/30' : ''}>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => toggleExpand(order.id)}
                    >
                      {expandedId === order.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">{order.vpoNumber}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {order.soReference || '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{order.customerName || '-'}</TableCell>
                  <TableCell className="whitespace-nowrap">{order.supplierName || '-'}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {order.orderDate || '-'}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {order.expShipDate || '-'}
                  </TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate" title={order.shipTo || ''}>
                    {order.shipTo || '-'}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {order.paymentTerms || '-'}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {order.workflowStatus || '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap">
                    ${order.totalAmount || '0'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                      >
                        {t('OrdersTable.open', 'Open')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteClick(order.id)}
                        disabled={loadingId === order.id}
                        title={t('OrdersTable.delete', 'Delete')}
                      >
                        {loadingId === order.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded Detail Row */}
                {expandedId === order.id && (
                  <TableRow key={`${order.id}-detail`} className="bg-muted/10 hover:bg-muted/10">
                    <TableCell colSpan={colCount} className="p-0">
                      <div className="p-6 space-y-6 border-t border-b">
                        {expandLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : expandedData ? (
                          <>
                            {/* Action Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!!workflowLoading || editMode}
                                  onClick={() => triggerWorkflow('GENERATE_SHIPPING_DOC')}
                                >
                                  {workflowLoading === 'GENERATE_SHIPPING_DOC' ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : null}
                                  {t('OrdersTable.sendShippingDoc', 'Send Shipping Doc')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!!workflowLoading || editMode}
                                  onClick={() => triggerWorkflow('START_TRANSIT')}
                                >
                                  {workflowLoading === 'START_TRANSIT' ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : null}
                                  {t('OrdersTable.startTransit', 'Start Transit')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!!workflowLoading || editMode}
                                  onClick={() => triggerWorkflow('MARK_DELIVERED')}
                                >
                                  {workflowLoading === 'MARK_DELIVERED' ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : null}
                                  {t('OrdersTable.markDelivered', 'Mark Delivered')}
                                </Button>
                              </div>

                              <div className="flex items-center gap-2">
                                {editMode ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={cancelEdit}
                                      disabled={saving}
                                    >
                                      <X className="h-4 w-4 mr-1" />{' '}
                                      {t('OrdersTable.cancel', 'Cancel')}
                                    </Button>
                                    <Button size="sm" onClick={saveEdit} disabled={saving}>
                                      {saving ? (
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      ) : (
                                        <Save className="h-4 w-4 mr-1" />
                                      )}
                                      {t('OrdersTable.save', 'Save')}
                                    </Button>
                                  </>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={startEdit}>
                                    <Pencil className="h-4 w-4 mr-1" />{' '}
                                    {t('OrdersTable.edit', 'Edit')}
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Order Header Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              {/* Dates */}
                              <div className="p-4 border rounded-lg bg-background space-y-3">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  📅 {t('OrdersTable.dates', 'Dates')}
                                </h4>
                                <FieldRow
                                  label={t('OrdersTable.orderDate', 'Order Date')}
                                  field="orderDate"
                                />
                                <FieldRow
                                  label={t('OrdersTable.expShip', 'Exp Ship')}
                                  field="expShipDate"
                                />
                                <FieldRow
                                  label={t('OrdersTable.rWhs', 'R Whs')}
                                  field="cancelDate"
                                />
                              </div>

                              {/* Shipping */}
                              <div className="p-4 border rounded-lg bg-background space-y-3">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  🚚 {t('OrdersTable.shipping', 'Shipping')}
                                </h4>
                                <FieldRow
                                  label={t('OrdersTable.shipVia', 'Ship Via')}
                                  field="shipVia"
                                />
                                <FieldRow
                                  label={t('OrdersTable.shipTerms', 'Ship Terms')}
                                  field="shipmentTerms"
                                />
                                <FieldRow
                                  label={t('OrdersTable.shipTo', 'Ship To')}
                                  field="shipTo"
                                />
                              </div>

                              {/* Payment */}
                              <div className="p-4 border rounded-lg bg-background space-y-3">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  💰 {t('OrdersTable.payment', 'Payment')}
                                </h4>
                                <FieldRow
                                  label={t('OrdersTable.terms', 'Terms')}
                                  field="paymentTerms"
                                />
                                <FieldRow
                                  label={t('OrdersTable.workflow', 'Workflow')}
                                  field="workflowStatus"
                                />
                                <FieldRow
                                  label={t('OrdersTable.amount', 'Amount')}
                                  field="totalAmount"
                                />
                                <FieldRow
                                  label={t('OrdersTable.soRef', 'SO Ref')}
                                  field="soReference"
                                />
                              </div>
                            </div>

                            {/* Customer / Supplier */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="p-4 border rounded-lg bg-background space-y-2 min-w-0">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  👤 {t('OrdersTable.customerBillTo', 'Customer (Bill To)')}
                                </h4>
                                {editMode ? (
                                  <>
                                    <Input
                                      value={editData.customerName || ''}
                                      onChange={(e) => editField('customerName', e.target.value)}
                                      placeholder={t('OrdersTable.customer', 'Customer')}
                                      className="mb-1 w-full"
                                    />
                                    <Textarea
                                      value={editData.customerAddress || ''}
                                      onChange={(e) => editField('customerAddress', e.target.value)}
                                      placeholder={t('OrdersTable.address', 'Address')}
                                      className="w-full resize-none"
                                      rows={3}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <div className="text-sm font-semibold break-words">
                                      {expandedData.customerName || '-'}
                                    </div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                                      {expandedData.customerAddress || '-'}
                                    </div>
                                  </>
                                )}
                              </div>
                              <div className="p-4 border rounded-lg bg-background space-y-2 min-w-0">
                                <h4 className="text-sm font-semibold text-muted-foreground">
                                  🏭 {t('OrdersTable.supplier', 'Supplier')}
                                </h4>
                                {editMode ? (
                                  <>
                                    <Input
                                      value={editData.supplierName || ''}
                                      onChange={(e) => editField('supplierName', e.target.value)}
                                      placeholder={t('OrdersTable.supplier', 'Supplier')}
                                      className="mb-1 w-full"
                                    />
                                    <Textarea
                                      value={editData.supplierAddress || ''}
                                      onChange={(e) => editField('supplierAddress', e.target.value)}
                                      placeholder={t('OrdersTable.address', 'Address')}
                                      className="w-full resize-none"
                                      rows={3}
                                    />
                                  </>
                                ) : (
                                  <>
                                    <div className="text-sm font-semibold break-words">
                                      {expandedData.supplierName || '-'}
                                    </div>
                                    <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                                      {expandedData.supplierAddress || '-'}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Items Table */}
                            <div className="space-y-2">
                              <h4 className="text-sm font-semibold text-muted-foreground">
                                📦{' '}
                                {t('OrdersTable.itemCount', 'Items ({count})', {
                                  count: editMode
                                    ? editItems.length
                                    : (expandedData?.items?.length ?? 0),
                                })}
                              </h4>
                              <div className="border rounded-md overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>{t('FinanceManager.code', 'Code')}</TableHead>
                                      <TableHead>
                                        {t('OrdersTable.description', 'Description')}
                                      </TableHead>
                                      <TableHead>
                                        {t('OrdersTable.collection', 'Collection')}
                                      </TableHead>
                                      <TableHead>{t('OrdersTable.color', 'Color')}</TableHead>
                                      <TableHead>{t('OrdersTable.material', 'Material')}</TableHead>
                                      <TableHead className="text-right">
                                        {t('OrdersTable.qty', 'Qty')}
                                      </TableHead>
                                      <TableHead className="text-right">
                                        {t('OrdersTable.custPrice', 'Cust $')}
                                      </TableHead>
                                      <TableHead className="text-right">
                                        {t('OrdersTable.vendorPrice', 'Vendor $')}
                                      </TableHead>
                                      <TableHead className="text-right">
                                        {t('Workflow.total', 'Total')}
                                      </TableHead>
                                      <TableHead className="text-right">
                                        {t('OrdersTable.estMargin', 'Est Margin')}
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(editMode ? editItems : expandedData.items)?.map(
                                      (item, idx) => (
                                        <TableRow key={item.id}>
                                          <TableCell>
                                            {editMode ? (
                                              <Input
                                                value={item.productCode || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'productCode', e.target.value)
                                                }
                                                className="h-7 text-xs w-[100px]"
                                              />
                                            ) : (
                                              <span className="font-medium">
                                                {item.productCode}
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {editMode ? (
                                              <Input
                                                value={item.description || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'description', e.target.value)
                                                }
                                                className="h-7 text-xs w-[180px]"
                                              />
                                            ) : (
                                              <>
                                                <div>{item.description}</div>
                                                {item.productClass && (
                                                  <div className="text-xs text-muted-foreground">
                                                    {t('TariffManager.tariffKey', 'Tariff Key')}:{' '}
                                                    {item.productClass}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {editMode ? (
                                              <Input
                                                value={item.collection || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'collection', e.target.value)
                                                }
                                                className="h-7 text-xs w-[80px]"
                                              />
                                            ) : (
                                              <span className="text-xs">
                                                {item.collection || '-'}
                                              </span>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {editMode ? (
                                              <Input
                                                value={item.color || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'color', e.target.value)
                                                }
                                                className="h-7 text-xs w-[80px]"
                                              />
                                            ) : (
                                              <span className="text-xs">{item.color || '-'}</span>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            {editMode ? (
                                              <Input
                                                value={item.material || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'material', e.target.value)
                                                }
                                                className="h-7 text-xs w-[100px]"
                                              />
                                            ) : (
                                              <>
                                                <div className="text-xs">
                                                  {item.material || '-'}
                                                </div>
                                                {item.sizeBreakdown && (
                                                  <div className="mt-1 text-xs text-muted-foreground italic">
                                                    {(() => {
                                                      try {
                                                        const sizes =
                                                          typeof item.sizeBreakdown === 'string'
                                                            ? JSON.parse(item.sizeBreakdown)
                                                            : item.sizeBreakdown;
                                                        return Object.entries(sizes)
                                                          .map(([k, v]) => `${k}:${v}`)
                                                          .join(', ');
                                                      } catch {
                                                        return '';
                                                      }
                                                    })()}
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {editMode ? (
                                              <Input
                                                value={String(item.quantity || '')}
                                                onChange={(e) =>
                                                  editItemField(idx, 'quantity', e.target.value)
                                                }
                                                className="h-7 text-xs w-[60px] text-right"
                                              />
                                            ) : (
                                              item.quantity
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {editMode ? (
                                              <Input
                                                value={
                                                  item.customerUnitPrice || item.unitPrice || ''
                                                }
                                                onChange={(e) =>
                                                  editItemField(
                                                    idx,
                                                    'customerUnitPrice',
                                                    e.target.value
                                                  )
                                                }
                                                className="h-7 text-xs w-[70px] text-right"
                                              />
                                            ) : (
                                              `$${Number(item.customerUnitPrice || item.unitPrice).toFixed(2)}`
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {editMode ? (
                                              <Input
                                                value={item.vendorUnitPrice || ''}
                                                onChange={(e) =>
                                                  editItemField(
                                                    idx,
                                                    'vendorUnitPrice',
                                                    e.target.value
                                                  )
                                                }
                                                className="h-7 text-xs w-[70px] text-right"
                                              />
                                            ) : (
                                              `$${Number(item.vendorUnitPrice || 0).toFixed(2)}`
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {editMode ? (
                                              <Input
                                                value={item.total || ''}
                                                onChange={(e) =>
                                                  editItemField(idx, 'total', e.target.value)
                                                }
                                                className="h-7 text-xs w-[80px] text-right"
                                              />
                                            ) : (
                                              `$${Number(item.total).toFixed(2)}`
                                            )}
                                          </TableCell>
                                          <TableCell className="text-right">
                                            {editMode ? (
                                              <Input
                                                value={item.estimatedMargin || ''}
                                                onChange={(e) =>
                                                  editItemField(
                                                    idx,
                                                    'estimatedMargin',
                                                    e.target.value
                                                  )
                                                }
                                                className="h-7 text-xs w-[90px] text-right"
                                              />
                                            ) : (
                                              <span
                                                className={
                                                  Number(item.estimatedMargin || 0) >= 0
                                                    ? 'text-emerald-600'
                                                    : 'text-destructive'
                                                }
                                              >
                                                ${Number(item.estimatedMargin || 0).toFixed(2)}
                                              </span>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      )
                                    )}
                                    {(() => {
                                      const items = editMode ? editItems : expandedData.items;
                                      if (items && items.length > 0) {
                                        return (
                                          <TableRow className="bg-muted/20 font-semibold">
                                            <TableCell colSpan={5} className="text-right">
                                              {t('Workflow.total', 'Total')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {(items as OrderItem[]).reduce(
                                                (s: number, i) => s + (Number(i.quantity) || 0),
                                                0
                                              )}
                                            </TableCell>
                                            <TableCell></TableCell>
                                            <TableCell></TableCell>
                                            <TableCell className="text-right text-green-600">
                                              $
                                              {(items as OrderItem[])
                                                .reduce(
                                                  (s: number, i) => s + Number(i.total || 0),
                                                  0
                                                )
                                                .toFixed(2)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {(items as OrderItem[])
                                                .reduce(
                                                  (s: number, i) =>
                                                    s + Number(i.estimatedMargin || 0),
                                                  0
                                                )
                                                .toFixed(2)}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      }
                                      if (!items || items.length === 0) {
                                        return (
                                          <TableRow>
                                            <TableCell
                                              colSpan={10}
                                              className="text-center py-6 text-muted-foreground"
                                            >
                                              {t('OrdersTable.noItemsFound', 'No items found')}
                                            </TableCell>
                                          </TableRow>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-4 text-muted-foreground">
                            {t('OrdersTable.failedToLoadDetails', 'Failed to load details')}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {hasMore && (
        <div className="flex justify-center py-4">
          <Button onClick={loadMoreOrders} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}{' '}
            {loadingMore
              ? t('OrdersTable.loadingMore', 'Loading...')
              : t('OrdersTable.loadMore', 'Load more')}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('OrdersTable.deleteOrderTitle', 'Delete Order')}
        description={t(
          'OrdersTable.deleteOrderConfirm',
          'Are you sure you want to delete this order? This action cannot be undone.'
        )}
        onConfirm={confirmDelete}
        loading={!!loadingId}
      />
    </>
  );

  // --- Reusable Field Row ---
  function FieldRow({ label, field }: { label: string; field: keyof SerializedOrder }) {
    return (
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground shrink-0">{label}:</span>
        {editMode ? (
          <Input
            value={(editData[field as keyof typeof editData] as string) || ''}
            onChange={(e) => editField(field, e.target.value)}
            className="h-7 text-sm flex-1"
          />
        ) : (
          <span className="font-medium text-right">
            {(expandedData?.[field as keyof typeof expandedData] as string) || '-'}
          </span>
        )}
      </div>
    );
  }
}
