'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { formatDate } from '@/lib/format';
import { usePromptDialog, PromptDialog } from '@/components/ui/prompt-dialog';

interface OrderOption {
  id: string;
  vpoNumber: string;
  workflowStatus: string | null;
}

interface ContainerRow {
  id: string;
  containerNo: string;
  vesselName: string | null;
  status: string | null;
  etd: string | null;
  eta: string | null;
  atd: string | null;
  ata: string | null;
  arrivalAtWarehouse: string | null;
}

interface AllocationRow {
  id: string;
  containerId: string;
  orderId: string;
  allocatedQty: number | null;
  allocatedAmount: string | null;
  createdAt: string | null;
}

interface ShippingDocRow {
  id: string;
  docNo: string;
  orderId: string;
  containerId: string | null;
  issueDate: string | null;
  status: string | null;
  payload: string | null;
}

interface OrderItemRow {
  id: string;
  productCode: string | null;
  description: string | null;
  quantity: number | null;
  total: string | null;
  customerUnitPrice: string | null;
  color: string | null;
  material: string | null;
}

interface OrderDetails {
  id: string;
  vpoNumber: string;
  soReference: string | null;
  customerName: string | null;
  customerAddress: string | null;
  supplierName: string | null;
  supplierAddress: string | null;
  orderDate: string | null;
  expShipDate: string | null;
  shipTo: string | null;
  shipVia: string | null;
  paymentTerms: string | null;
  shipmentTerms: string | null;
  totalAmount: string | null;
  items: OrderItemRow[];
}

export function LogisticsManager() {
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [shippingDocs, setShippingDocs] = useState<ShippingDocRow[]>([]);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [selectedContainerId, setSelectedContainerId] = useState('');
  const [allocationQty, setAllocationQty] = useState('');

  const [containerNo, setContainerNo] = useState('');
  const [vesselName, setVesselName] = useState('');

  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const { openPrompt, promptDialogProps } = usePromptDialog();

  const orderMap = useMemo(() => {
    return new Map(orders.map((order) => [order.id, order]));
  }, [orders]);

  const containerMap = useMemo(() => {
    return new Map(containers.map((container) => [container.id, container]));
  }, [containers]);

  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) || null,
    [orders, selectedOrderId]
  );

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
    setContainers(data.data as ContainerRow[]);
  }, []);

  const loadOrderLogisticsData = useCallback(
    async (orderId: string) => {
      if (!orderId) {
        setAllocations([]);
        setShippingDocs([]);
        return;
      }
      const [allocRes, docRes] = await Promise.all([
        fetch(`/api/logistics/allocations?orderId=${orderId}`, { cache: 'no-store' }),
        fetch(`/api/logistics/shipping-docs?orderId=${orderId}`, { cache: 'no-store' }),
      ]);

      const allocData = await allocRes.json();
      const docData = await docRes.json();

      if (allocRes.ok && allocData.success && Array.isArray(allocData.data)) {
        const rows = allocData.data as AllocationRow[];
        setAllocations(rows);
        if (!selectedContainerId && rows.length > 0 && rows[0]?.containerId) {
          setSelectedContainerId(rows[0].containerId);
        }
      } else {
        setAllocations([]);
      }

      if (docRes.ok && docData.success && Array.isArray(docData.data)) {
        setShippingDocs(docData.data as ShippingDocRow[]);
      } else {
        setShippingDocs([]);
      }
    },
    [selectedContainerId]
  );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        await Promise.all([loadOrders(), loadContainers()]);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [loadContainers, loadOrders]);

  useEffect(() => {
    if (!selectedOrderId) return;
    setLoading(true);
    loadOrderLogisticsData(selectedOrderId).finally(() => setLoading(false));
  }, [selectedOrderId, loadOrderLogisticsData]);

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
      await Promise.all([loadOrders(), loadContainers()]);
      if (selectedOrderId) {
        await loadOrderLogisticsData(selectedOrderId);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const parsePayload = (payload: string | null) => {
    if (!payload) return {} as Record<string, string>;
    try {
      const parsed = JSON.parse(payload);
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, string>) : {};
    } catch {
      return {};
    }
  };

  const getLatestShippingDoc = () => {
    if (shippingDocs.length === 0) return null;
    return [...shippingDocs].sort((a, b) => {
      const ta = new Date(a.issueDate || 0).getTime();
      const tb = new Date(b.issueDate || 0).getTime();
      return tb - ta;
    })[0];
  };

  const getSafeDate = (value?: string | null) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };

  const getSafeFilename = (prefix: string) => {
    const selected = selectedOrder?.vpoNumber || 'ORDER';
    const cleaned = selected.replace(/[^a-z0-9-_]/gi, '_');
    return `${prefix}-${cleaned}`;
  };

  const loadOrderDetails = async (): Promise<OrderDetails> => {
    if (!selectedOrderId) throw new Error('Select an order first');
    const res = await fetch(`/api/orders/${selectedOrderId}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load order details');
    return data as OrderDetails;
  };

  const readError = async (res: Response, fallback: string) => {
    const payload = await res.json().catch(() => ({}));
    return payload?.error || fallback;
  };

  const createContainer = async () => {
    if (!containerNo.trim()) return;
    await runAction('CREATE_CONTAINER', async () => {
      const res = await fetch('/api/logistics/containers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerNo: containerNo.trim(),
          vesselName: vesselName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to create container'));
      setContainerNo('');
      setVesselName('');
    });
  };

  const editContainer = async (row: ContainerRow) => {
    const result = await openPrompt({
      title: 'Edit Container',
      fields: [
        { key: 'containerNo', label: 'Container No', defaultValue: row.containerNo || '' },
        {
          key: 'vessel',
          label: 'Vessel Name',
          defaultValue: row.vesselName || '',
          placeholder: 'optional',
        },
        { key: 'status', label: 'Status', defaultValue: row.status || 'PLANNED' },
        {
          key: 'eta',
          label: 'ETA (YYYY-MM-DD)',
          defaultValue: row.eta ? new Date(row.eta).toISOString().slice(0, 10) : '',
          placeholder: 'optional',
        },
      ],
    });
    if (!result) return;

    await runAction(`EDIT_CONTAINER_${row.id}`, async () => {
      const res = await fetch(`/api/logistics/containers?id=${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerNo: result.containerNo.trim(),
          vesselName: result.vessel.trim() ? result.vessel.trim() : null,
          status: result.status.trim() || 'PLANNED',
          eta: result.eta.trim() ? result.eta.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Failed to edit container'));
    });
  };

  const deleteContainer = async (row: ContainerRow) => {
    const ok = window.confirm(
      `Delete container ${row.containerNo}? Linked allocations may be removed and linked docs may be detached.`
    );
    if (!ok) return;

    await runAction(`DELETE_CONTAINER_${row.id}`, async () => {
      const res = await fetch(`/api/logistics/containers?id=${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await readError(res, 'Failed to delete container'));
      if (selectedContainerId === row.id) {
        setSelectedContainerId('');
      }
    });
  };

  const allocateOrderToContainer = async () => {
    if (!selectedOrderId || !selectedContainerId) return;
    await runAction('ALLOCATE', async () => {
      await fetch('/api/logistics/allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedOrderId,
          containerId: selectedContainerId,
          allocatedQty: allocationQty || undefined,
        }),
      });
      setAllocationQty('');
    });
  };

  const sendShippingDoc = async () => {
    if (!selectedOrderId) return;
    await runAction('SEND_DOC', async () => {
      await fetch(`/api/workflow/orders/${selectedOrderId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GENERATE_SHIPPING_DOC',
          containerId: selectedContainerId || undefined,
        }),
      });
    });
  };

  const startTransit = async () => {
    if (!selectedOrderId) return;
    await runAction('START_TRANSIT', async () => {
      await fetch(`/api/workflow/orders/${selectedOrderId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'START_TRANSIT',
          containerId: selectedContainerId || undefined,
        }),
      });
    });
  };

  const markDelivered = async () => {
    if (!selectedOrderId) return;
    await runAction('MARK_DELIVERED', async () => {
      await fetch(`/api/workflow/orders/${selectedOrderId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'MARK_DELIVERED',
          containerId: selectedContainerId || undefined,
        }),
      });
    });
  };

  const exportShippingRequestExcel = async () => {
    await runAction('EXPORT_SHIP_REQ_XLSX', async () => {
      const order = await loadOrderDetails();
      const latestDoc = getLatestShippingDoc();
      const container = selectedContainerId
        ? containers.find((c) => c.id === selectedContainerId)
        : null;
      const payload = parsePayload(latestDoc?.payload || null);
      const Workbook = (await import('exceljs')).default.Workbook;
      const workbook = new Workbook();
      const ws = workbook.addWorksheet('3PL Request');
      ws.columns = [{ width: 20 }, { width: 40 }, { width: 20 }, { width: 28 }];

      ws.mergeCells('A1:D1');
      ws.getCell('A1').value = 'SHIPMENT BOOKING REQUEST (TO 3PL)';
      ws.getCell('A1').font = { bold: true, size: 16 };
      ws.getCell('A1').alignment = { horizontal: 'center' };

      ws.getCell('A3').value = 'Order';
      ws.getCell('B3').value = order.vpoNumber || '-';
      ws.getCell('C3').value = 'Shipping Doc';
      ws.getCell('D3').value = latestDoc?.docNo || '-';

      ws.getCell('A4').value = 'Customer';
      ws.getCell('B4').value = order.customerName || '-';
      ws.getCell('C4').value = 'Supplier';
      ws.getCell('D4').value = order.supplierName || '-';

      ws.getCell('A5').value = 'Ship To';
      ws.getCell('B5').value = order.shipTo || '-';
      ws.getCell('C5').value = 'Ship Via';
      ws.getCell('D5').value = order.shipVia || '-';

      ws.getCell('A6').value = 'ETD';
      ws.getCell('B6').value = getSafeDate(container?.etd || order.expShipDate);
      ws.getCell('C6').value = 'ETA';
      ws.getCell('D6').value = getSafeDate(container?.eta || null);

      ws.getCell('A7').value = 'Container';
      ws.getCell('B7').value = container?.containerNo || payload.containerNo || 'TBD by 3PL';
      ws.getCell('C7').value = 'Vessel';
      ws.getCell('D7').value = container?.vesselName || payload.vesselName || 'TBD by 3PL';

      ws.getCell('A9').value = '3PL Actions Required';
      ws.getCell('A9').font = { bold: true };
      ws.getCell('A10').value = '1) Confirm booking (container + vessel + schedule)';
      ws.getCell('A11').value = '2) Provide warehouse entry notice after booking';
      ws.getCell('A12').value = '3) Upload BOL and 7501 after vessel departure';
      ws.mergeCells('A10:D10');
      ws.mergeCells('A11:D11');
      ws.mergeCells('A12:D12');

      ws.getCell('A14').value = 'BOL Link';
      ws.getCell('B14').value = payload.bolUrl || '';
      ws.getCell('C14').value = '7501 Link';
      ws.getCell('D14').value = payload.customs7501Url || '';

      ws.addRow([]);
      const headerRow = ws.addRow(['Style', 'Description', 'Qty', 'Amount']);
      headerRow.font = { bold: true };
      order.items.forEach((item) => {
        ws.addRow([
          item.productCode || '-',
          item.description || '-',
          Number(item.quantity || 0),
          Number(item.total || 0),
        ]);
      });
      const totalQty = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const totalAmount = order.items.reduce((sum, item) => sum + Number(item.total || 0), 0);
      const totalRow = ws.addRow(['TOTAL', '', totalQty, totalAmount]);
      totalRow.font = { bold: true };
      ws.getColumn(4).numFmt = '"$"#,##0.00';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getSafeFilename('3PL-REQUEST')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const exportShippingRequestPdf = async () => {
    await runAction('EXPORT_SHIP_REQ_PDF', async () => {
      const order = await loadOrderDetails();
      const latestDoc = getLatestShippingDoc();
      const container = selectedContainerId
        ? containers.find((c) => c.id === selectedContainerId)
        : null;
      const payload = parsePayload(latestDoc?.payload || null);
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('SHIPMENT BOOKING REQUEST (TO 3PL)', 105, 16, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Order: ${order.vpoNumber || '-'}`, 14, 28);
      doc.text(`Shipping Doc: ${latestDoc?.docNo || '-'}`, 110, 28);
      doc.text(`Customer: ${order.customerName || '-'}`, 14, 34);
      doc.text(`Supplier: ${order.supplierName || '-'}`, 110, 34);
      doc.text(`Ship To: ${order.shipTo || '-'}`, 14, 40);
      doc.text(`Ship Via: ${order.shipVia || '-'}`, 110, 40);
      doc.text(
        `Container: ${container?.containerNo || payload.containerNo || 'TBD by 3PL'}`,
        14,
        46
      );
      doc.text(`Vessel: ${container?.vesselName || payload.vesselName || 'TBD by 3PL'}`, 110, 46);
      doc.text(`BOL Link: ${payload.bolUrl || '-'}`, 14, 52, { maxWidth: 180 });
      doc.text(`7501 Link: ${payload.customs7501Url || '-'}`, 14, 58, { maxWidth: 180 });
      doc.text('3PL Required: booking confirmation, warehouse notice, BOL + 7501 upload.', 14, 66);

      const rows = order.items.map((item) => [
        item.productCode || '-',
        item.description || '-',
        Number(item.quantity || 0),
        `$${Number(item.total || 0).toFixed(2)}`,
      ]);
      autoTable(doc, {
        startY: 72,
        head: [['Style', 'Description', 'Qty', 'Amount']],
        body: rows,
        styles: { fontSize: 9 },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
      });
      doc.save(`${getSafeFilename('3PL-REQUEST')}.pdf`);
    });
  };

  const exportCustomerDocsExcel = async () => {
    await runAction('EXPORT_CUSTOMER_DOCS_XLSX', async () => {
      const order = await loadOrderDetails();
      const latestDoc = getLatestShippingDoc();
      const container = selectedContainerId
        ? containers.find((c) => c.id === selectedContainerId)
        : null;
      const payload = parsePayload(latestDoc?.payload || null);
      const isHK = (order.customerName || '').toLowerCase().includes('hongkong');
      const issuerName = isHK ? 'MIJENRO HONGKONG LTD' : 'MIJENRO INTERNATIONAL LLC';
      const issuerAddr = isHK
        ? 'Room 704,7/F.,Tower A,New Mandarin Plaza,14 Science Museum Road,TST EAST,Kowloon,Hongkong'
        : '10740 Queens Blvd 12J, Forest Hills, 11375';

      const Workbook = (await import('exceljs')).default.Workbook;
      const workbook = new Workbook();
      const inv = workbook.addWorksheet('INV');
      const pl = workbook.addWorksheet('PL');
      [inv, pl].forEach((ws) => {
        ws.columns = [
          { width: 20 },
          { width: 36 },
          { width: 14 },
          { width: 40 },
          { width: 12 },
          { width: 14 },
          { width: 16 },
        ];
      });

      inv.mergeCells('A1:G1');
      inv.getCell('A1').value = issuerName;
      inv.getCell('A2').value = issuerAddr;
      inv.getCell('A4').value = 'COMMERCIAL INVOICE';
      inv.getCell('A7').value = 'INVOICE TO:';
      inv.getCell('B7').value = order.supplierName || 'C-Life Group,Ltd.';
      inv.getCell('F7').value = 'DATE:';
      inv.getCell('G7').value = getSafeDate(latestDoc?.issueDate || order.orderDate);
      inv.getCell('A12').value = 'INV NO.:';
      inv.getCell('B12').value = latestDoc?.docNo || order.vpoNumber;
      inv.getCell('F12').value = 'TERMS:';
      inv.getCell('G12').value = order.paymentTerms || '';
      inv.getCell('A13').value = 'REF NO.:';
      inv.getCell('B13').value = order.soReference || order.vpoNumber || '';
      inv.getCell('F13').value = 'PORT OF DESTINATION:';
      inv.getCell('G13').value = 'LONG BEACH,CA';
      inv.getCell('F15').value = 'BL#:';
      inv.getCell('G15').value = payload.bolNo || payload.bolUrl || '';

      const invHeader = inv.addRow([]);
      invHeader.values = ['PO NO.', 'STYLE NO.', '', 'DESCRIPTION', 'QTY.', 'PRICE', 'AMOUNT'];
      invHeader.font = { bold: true };
      order.items.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.customerUnitPrice || 0);
        inv.addRow([
          order.soReference || order.vpoNumber || '',
          item.productCode || '',
          '',
          item.description || '',
          qty,
          price,
          qty * price,
        ]);
      });
      const invTotalQty = order.items.reduce((s, x) => s + Number(x.quantity || 0), 0);
      const invTotal = order.items.reduce(
        (s, x) => s + Number(x.quantity || 0) * Number(x.customerUnitPrice || 0),
        0
      );
      const invTotalRow = inv.addRow(['GRAND TOTAL', '', '', '', invTotalQty, '', invTotal]);
      invTotalRow.font = { bold: true };
      inv.getColumn(6).numFmt = '"$"#,##0.00';
      inv.getColumn(7).numFmt = '"$"#,##0.00';

      pl.mergeCells('A1:G1');
      pl.getCell('A1').value = issuerName;
      pl.getCell('A2').value = issuerAddr;
      pl.getCell('A4').value = 'PACKING LIST';
      pl.getCell('A7').value = 'CONSIGNEE:';
      pl.getCell('B7').value = order.shipTo || order.supplierAddress || '';
      pl.getCell('A12').value = 'BL#:';
      pl.getCell('B12').value = payload.bolNo || payload.bolUrl || '';
      pl.getCell('D12').value = 'Container#:';
      pl.getCell('E12').value = container?.containerNo || payload.containerNo || '';

      const plHeader = pl.addRow([]);
      plHeader.values = [
        'VPO/SO',
        'Product Code',
        'Color',
        'Description',
        'CTNS',
        'QTY.',
        'Total Pcs',
      ];
      plHeader.font = { bold: true };
      order.items.forEach((item) => {
        const qty = Number(item.quantity || 0);
        pl.addRow([
          `VPO-${order.vpoNumber || ''}`,
          item.productCode || '',
          item.color || '',
          item.description || '',
          '',
          qty,
          qty,
        ]);
      });
      const plTotal = order.items.reduce((s, x) => s + Number(x.quantity || 0), 0);
      const plTotalRow = pl.addRow(['TOTAL', '', '', '', '', '', plTotal]);
      plTotalRow.font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${getSafeFilename('CUSTOMER-CI-PL')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  const exportCustomerDocsPdf = async () => {
    await runAction('EXPORT_CUSTOMER_DOCS_PDF', async () => {
      const order = await loadOrderDetails();
      const latestDoc = getLatestShippingDoc();
      const container = selectedContainerId
        ? containers.find((c) => c.id === selectedContainerId)
        : null;
      const payload = parsePayload(latestDoc?.payload || null);
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('COMMERCIAL INVOICE', 105, 16, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`INV NO: ${latestDoc?.docNo || order.vpoNumber || ''}`, 14, 26);
      doc.text(`REF: ${order.soReference || order.vpoNumber || ''}`, 110, 26);
      doc.text(`BOL: ${payload.bolNo || '-'}`, 14, 32);
      doc.text(`Container: ${container?.containerNo || payload.containerNo || '-'}`, 110, 32);
      autoTable(doc, {
        startY: 38,
        head: [['Style', 'Description', 'Qty', 'Price', 'Amount']],
        body: order.items.map((item) => {
          const qty = Number(item.quantity || 0);
          const price = Number(item.customerUnitPrice || 0);
          return [
            item.productCode || '',
            item.description || '',
            qty,
            `$${price.toFixed(2)}`,
            `$${(qty * price).toFixed(2)}`,
          ];
        }),
        styles: { fontSize: 9 },
      });

      doc.addPage();
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('PACKING LIST', 105, 16, { align: 'center' });
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Ship To: ${order.shipTo || '-'}`, 14, 26, { maxWidth: 180 });
      autoTable(doc, {
        startY: 34,
        head: [['VPO/SO', 'Product Code', 'Color', 'Description', 'Qty']],
        body: order.items.map((item) => [
          `VPO-${order.vpoNumber || ''}`,
          item.productCode || '',
          item.color || '',
          item.description || '',
          Number(item.quantity || 0),
        ]),
        styles: { fontSize: 9 },
      });

      doc.save(`${getSafeFilename('CUSTOMER-CI-PL')}.pdf`);
    });
  };

  const updateShippingDocLinks = async (row: ShippingDocRow) => {
    const payload = parsePayload(row.payload);
    const result = await openPrompt({
      title: 'Shipping Document Links',
      fields: [
        { key: 'bolUrl', label: 'BOL upload/download link', defaultValue: payload.bolUrl || '' },
        {
          key: 'customs7501Url',
          label: '7501 upload/download link',
          defaultValue: payload.customs7501Url || '',
        },
        {
          key: 'entryNoticeUrl',
          label: 'Warehouse entry notice link',
          defaultValue: payload.entryNoticeUrl || '',
        },
        { key: 'bolNo', label: 'BOL number', defaultValue: payload.bolNo || '' },
      ],
    });
    if (!result) return;

    const nextPayload = {
      ...payload,
      bolUrl: result.bolUrl.trim(),
      customs7501Url: result.customs7501Url.trim(),
      entryNoticeUrl: result.entryNoticeUrl.trim(),
      bolNo: result.bolNo.trim(),
    };

    await runAction(`UPDATE_DOC_LINKS_${row.id}`, async () => {
      const res = await fetch(`/api/logistics/shipping-docs?id=${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: JSON.stringify(nextPayload),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to save links');
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_1fr]">
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

        <Select value={selectedContainerId || undefined} onValueChange={setSelectedContainerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select container (optional)" />
          </SelectTrigger>
          <SelectContent>
            {containers.map((container) => (
              <SelectItem key={container.id} value={container.id}>
                {container.containerNo} | {container.status || 'PLANNED'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'SEND_DOC'}
          onClick={sendShippingDoc}
        >
          {busyAction === 'SEND_DOC' ? 'Sending...' : 'Send Shipping Doc'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'START_TRANSIT'}
          onClick={startTransit}
        >
          {busyAction === 'START_TRANSIT' ? 'Starting...' : 'Start Transit'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'MARK_DELIVERED'}
          onClick={markDelivered}
        >
          {busyAction === 'MARK_DELIVERED' ? 'Updating...' : 'Mark Delivered'}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'EXPORT_SHIP_REQ_XLSX'}
          onClick={exportShippingRequestExcel}
        >
          {busyAction === 'EXPORT_SHIP_REQ_XLSX' ? 'Exporting...' : 'Export 3PL Request (Excel)'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'EXPORT_SHIP_REQ_PDF'}
          onClick={exportShippingRequestPdf}
        >
          {busyAction === 'EXPORT_SHIP_REQ_PDF' ? 'Exporting...' : 'Export 3PL Request (PDF)'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'EXPORT_CUSTOMER_DOCS_XLSX'}
          onClick={exportCustomerDocsExcel}
        >
          {busyAction === 'EXPORT_CUSTOMER_DOCS_XLSX'
            ? 'Exporting...'
            : 'Export Customer CI+PL (Excel)'}
        </Button>
        <Button
          variant="outline"
          disabled={!selectedOrderId || busyAction === 'EXPORT_CUSTOMER_DOCS_PDF'}
          onClick={exportCustomerDocsPdf}
        >
          {busyAction === 'EXPORT_CUSTOMER_DOCS_PDF'
            ? 'Exporting...'
            : 'Export Customer CI+PL (PDF)'}
        </Button>
      </div>

      {selectedOrder && (
        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
          Current Order:{' '}
          <span className="font-medium text-foreground">{selectedOrder.vpoNumber}</span> | Workflow:{' '}
          <span className="font-medium text-foreground">
            {selectedOrder.workflowStatus || 'PO_UPLOADED'}
          </span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder="New Container No"
          value={containerNo}
          onChange={(e) => setContainerNo(e.target.value)}
        />
        <Input
          placeholder="Vessel Name"
          value={vesselName}
          onChange={(e) => setVesselName(e.target.value)}
        />
        <Button
          onClick={createContainer}
          disabled={!containerNo.trim() || busyAction === 'CREATE_CONTAINER'}
        >
          {busyAction === 'CREATE_CONTAINER' ? 'Creating...' : 'Create Container'}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Input
          placeholder="Allocated Qty (optional)"
          value={allocationQty}
          onChange={(e) => setAllocationQty(e.target.value)}
        />
        <div className="text-xs text-muted-foreground flex items-center">
          Uses selected order + selected container
        </div>
        <Button
          onClick={allocateOrderToContainer}
          disabled={!selectedOrderId || !selectedContainerId || busyAction === 'ALLOCATE'}
        >
          {busyAction === 'ALLOCATE' ? 'Allocating...' : 'Allocate Order to Container'}
        </Button>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Container</TableHead>
              <TableHead>Vessel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>ATD</TableHead>
              <TableHead>ETA</TableHead>
              <TableHead>Arrived WH</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {containers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  {loading ? 'Loading...' : 'No containers yet'}
                </TableCell>
              </TableRow>
            ) : (
              containers.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.containerNo}</TableCell>
                  <TableCell>{row.vesselName || '-'}</TableCell>
                  <TableCell>{row.status || '-'}</TableCell>
                  <TableCell>{formatDate(row.atd)}</TableCell>
                  <TableCell>{formatDate(row.eta)}</TableCell>
                  <TableCell>{formatDate(row.arrivalAtWarehouse)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyAction === `EDIT_CONTAINER_${row.id}`}
                        onClick={() => editContainer(row)}
                      >
                        {busyAction === `EDIT_CONTAINER_${row.id}` ? 'Saving...' : 'Edit'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyAction === `DELETE_CONTAINER_${row.id}`}
                        onClick={() => deleteContainer(row)}
                      >
                        {busyAction === `DELETE_CONTAINER_${row.id}` ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shipping Doc</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Container</TableHead>
              <TableHead>Issue Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shippingDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  No shipping docs for this order
                </TableCell>
              </TableRow>
            ) : (
              shippingDocs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.docNo}</TableCell>
                  <TableCell>{orderMap.get(row.orderId)?.vpoNumber || row.orderId}</TableCell>
                  <TableCell>
                    {row.containerId
                      ? containerMap.get(row.containerId)?.containerNo || row.containerId
                      : '-'}
                  </TableCell>
                  <TableCell>{formatDate(row.issueDate)}</TableCell>
                  <TableCell>{row.status || '-'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyAction === `UPDATE_DOC_LINKS_${row.id}`}
                      onClick={() => updateShippingDocLinks(row)}
                    >
                      {busyAction === `UPDATE_DOC_LINKS_${row.id}` ? 'Saving...' : 'BOL/7501 Links'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Container</TableHead>
              <TableHead className="text-right">Allocated Qty</TableHead>
              <TableHead className="text-right">Allocated Amount</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No allocations for this order
                </TableCell>
              </TableRow>
            ) : (
              allocations.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{orderMap.get(row.orderId)?.vpoNumber || row.orderId}</TableCell>
                  <TableCell>
                    {containerMap.get(row.containerId)?.containerNo || row.containerId}
                  </TableCell>
                  <TableCell className="text-right">{row.allocatedQty ?? '-'}</TableCell>
                  <TableCell className="text-right">
                    {row.allocatedAmount ? `$${Number(row.allocatedAmount).toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <PromptDialog {...promptDialogProps} />
    </div>
  );
}
