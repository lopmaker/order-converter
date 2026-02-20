'use client';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
// import { ScrollArea } from "@/components/ui/scroll-area"; // Removed to fix scrolling
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Save,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Sparkles,
  Package,
  Truck,
  Building2,
  CreditCard,
  Download,
  FileSpreadsheet,
  User,
} from 'lucide-react';
import { ExtractedOrderData } from '@/lib/parser';
import { useEffect, useMemo, useState } from 'react';
import { PoPreviewDialog } from '@/components/po-preview/po-preview-dialog';
import {
  deriveTariffKey,
  inferOriginCountry,
  normalizeTariffKey,
  resolveTariffRate,
} from '@/lib/tariffs';
import { BUYER_OPTIONS, PAYMENT_TERMS } from '@/lib/constants';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface OrderFormProps {
  data?: ExtractedOrderData;
  isLoading?: boolean;
  processingStep?: string;
  rawText?: string;
  error?: string;
}

interface TariffRow {
  id: string;
  tariffKey?: string;
  productClass: string;
  tariffRate: number;
}

export function OrderForm({ data, isLoading, processingStep, rawText, error }: OrderFormProps) {
  // Data Refinement Logic on Init
  const initializeData = (inputData?: ExtractedOrderData): ExtractedOrderData => {
    if (!inputData) return { items: [] };

    const refined = { ...inputData };

    // 0. Sanitize numeric fields — AI may return them as strings (e.g. "2.75")
    if (refined.items) {
      refined.items = refined.items.map((item) => ({
        ...item,
        unitPrice: Number(String(item.unitPrice ?? 0).replace(/[^0-9.-]/g, '')) || 0,
        customerUnitPrice: Number(String(item.customerUnitPrice ?? item.unitPrice ?? 0).replace(/[^0-9.-]/g, '')) || 0,
        vendorUnitPrice: Number(String(item.vendorUnitPrice ?? 0).replace(/[^0-9.-]/g, '')) || 0,
        totalQty: Number(String(item.totalQty ?? 0).replace(/[^0-9.-]/g, '')) || 0,
        extension: Number(String(item.extension ?? 0).replace(/[^0-9.-]/g, '')) || 0,
      }));
    }

    // 1. VPO Number: Strip "VPO" and Append "M"
    if (refined.vpoNumber) {
      // Remove "VPO" prefix/text (case-insensitive) and hyphens/spaces
      let cleanVpo = refined.vpoNumber.replace(/vpo/iy, '').replace(/-/g, '').trim();
      if (!cleanVpo.endsWith('M')) {
        cleanVpo = `${cleanVpo}M`;
      }
      refined.vpoNumber = cleanVpo;
    }

    // 2. Buyer Address: Ignore PDF, default to NY (will be overridden by Kanglong logic if needed)
    refined.customerName = BUYER_OPTIONS.NY.name;
    refined.customerAddress = BUYER_OPTIONS.NY.address;

    // 3. Shipment Terms: Default to FOB
    refined.shipmentTerms = 'FOB';

    // 4. Payment Terms: Default to Net 90 days (will be overridden by Junheng logic if needed)
    refined.paymentTerms = 'Net 90 days';

    return refined;
  };

  const [formData, setFormData] = useState<ExtractedOrderData>(initializeData(data));
  const [isSaved, setIsSaved] = useState<boolean>(!!data);
  const [isPoPreviewOpen, setIsPoPreviewOpen] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [tariffByKey, setTariffByKey] = useState<Record<string, number>>({});

  // Update form when new data is loaded
  useEffect(() => {
    if (data) {
      setFormData(initializeData(data));
    }
  }, [data]);

  useEffect(() => {
    const loadTariffs = async () => {
      try {
        const res = await fetch('/api/tariffs', { cache: 'no-store' });
        if (!res.ok) return;
        const payload = await res.json();
        if (!payload?.success || !Array.isArray(payload.data)) return;
        const map = (payload.data as TariffRow[]).reduce<Record<string, number>>((acc, row) => {
          const key = normalizeTariffKey((row.tariffKey || row.productClass || '').trim());
          if (!key) return acc;
          acc[key] = Number(row.tariffRate || 0);
          return acc;
        }, {});
        setTariffByKey(map);
      } catch {
        // keep fallback defaults in UI
      }
    };
    loadTariffs();
  }, []);

  // Auto-switch Buyer based on Supplier
  useEffect(() => {
    if (formData.supplierName?.toLowerCase()?.includes('kanglong')) {
      setFormData((prev) => ({
        ...prev,
        customerName: BUYER_OPTIONS.HK.name,
        customerAddress: BUYER_OPTIONS.HK.address,
      }));
    } else {
      // Default to NY if not Kanglong (and if not already set to something specific, but requirement implies strict rule)
      // We'll set it to NY if it's currently empty or was previously auto-set.
      // To be safe and simple per request: "all other supplier will use Mijenro international LLC"
      setFormData((prev) => {
        // Only override if it matches HK (switching back) or is empty.
        // Or force it every time supplier changes to something else?
        // User said: "all other supplier will use Mijenro international LLC" -> implies strict rule.
        if (prev.customerName === BUYER_OPTIONS.HK.name || !prev.customerName) {
          return {
            ...prev,
            customerName: BUYER_OPTIONS.NY.name,
            customerAddress: BUYER_OPTIONS.NY.address,
          };
        }
        return prev;
      });
    }
  }, [formData.supplierName]);

  // Auto-set Payment Terms based on Supplier
  useEffect(() => {
    if (formData.supplierName?.toLowerCase()?.includes('junheng')) {
      setFormData((prev) => ({ ...prev, paymentTerms: 'Net 60 days' }));
    } else {
      // Default back to Net 90 days if not Junheng (and if it was likely auto-set or empty)
      setFormData((prev) => {
        if (prev.paymentTerms === 'Net 60 days' || !prev.paymentTerms) {
          return { ...prev, paymentTerms: 'Net 90 days' };
        }
        return prev;
      });
    }
  }, [formData.supplierName]);

  const updateField = (
    field: keyof ExtractedOrderData,
    value: ExtractedOrderData[keyof ExtractedOrderData]
  ) => {
    setFormData({ ...formData, [field]: value });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        {
          productCode: '',
          description: '',
          productClass: '',
          collection: '',
          material: '',
          color: '',
          unitPrice: 0,
          customerUnitPrice: 0,
          vendorUnitPrice: 0,
          totalQty: 0,
          extension: 0,
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
    expandedItems.delete(index);
    setExpandedItems(new Set(expandedItems));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = [...formData.items];
    if (field === 'unitPrice') {
      newItems[index] = {
        ...newItems[index],
        unitPrice: Number(value),
        customerUnitPrice: Number(value),
      };
    } else if (field === 'customerUnitPrice') {
      newItems[index] = {
        ...newItems[index],
        unitPrice: Number(value),
        customerUnitPrice: Number(value),
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    // Auto-calc extension
    if (field === 'unitPrice' || field === 'customerUnitPrice' || field === 'totalQty') {
      newItems[index].extension =
        Number(newItems[index].unitPrice) * Number(newItems[index].totalQty);
    }
    setFormData({ ...formData, items: newItems });
  };

  const tariffRateMap = useMemo(() => {
    return new Map<string, number>(
      Object.entries(tariffByKey).map(([key, rate]) => [normalizeTariffKey(key), Number(rate || 0)])
    );
  }, [tariffByKey]);

  const getTariffContext = (item: ExtractedOrderData['items'][number]) => {
    const baseTariffKey = deriveTariffKey({
      description: item.description,
      collection: item.collection,
      material: item.material,
    });
    const originCountry = inferOriginCountry(formData.supplierName, formData.supplierAddress);
    const tariffRate = resolveTariffRate({
      baseTariffKey,
      originCountry,
      tariffMap: tariffRateMap,
    }).rate;

    return { tariffRate, baseTariffKey, originCountry };
  };

  const getEstimate = (item: ExtractedOrderData['items'][number]) => {
    const qty = Number(item.totalQty || 0);
    const customerUnitPrice = Number(item.customerUnitPrice ?? item.unitPrice ?? 0);
    const vendorUnitPrice = Number(item.vendorUnitPrice || 0);
    const { tariffRate, baseTariffKey, originCountry } = getTariffContext(item);
    const vendorCost = vendorUnitPrice * qty;
    const dutyCost = vendorCost * tariffRate;           // real customs duty
    const handlingCost = dutyCost * 0.4;               // 3PL handling = duty × 0.4
    const shippingCost = 0.1 * qty;                    // $0.10/pc freight
    const est3pl = handlingCost + shippingCost;        // total 3PL bill
    const revenue = customerUnitPrice * qty;
    const margin = revenue - vendorCost - est3pl;
    const marginRate = revenue > 0 ? margin / revenue : 0;
    // Per-unit
    const dutyPerUnit = qty > 0 ? dutyCost / qty : 0;
    const handlingPerUnit = qty > 0 ? handlingCost / qty : 0;
    const est3plPerUnit = qty > 0 ? est3pl / qty : 0;
    return {
      tariffRate, baseTariffKey, originCountry,
      revenue, vendorCost,
      dutyCost, handlingCost, shippingCost, est3pl,
      margin, marginRate,
      dutyPerUnit, handlingPerUnit, est3plPerUnit,
    };
  };

  const toggleItemExpand = (index: number) => {
    const next = new Set(expandedItems);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setExpandedItems(next);
  };

  const getSupplierInitials = (name?: string) => {
    if (!name) return 'XX';
    const lower = name.toLowerCase();
    if (lower.includes('kanglong')) return 'KL';
    if (lower.includes('yixinya')) return 'YXY';
    if (lower.includes('junheng')) return 'JH';

    // Fallback: First letter of each word, max 3 chars
    return (
      name
        .split(' ')
        .map((word) => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 3) || 'XX'
    );
  };

  type PriceMode = 'customer' | 'vendor';

  const getSafeFilename = (ext: string, mode: PriceMode = 'customer') => {
    const safeVpo = (formData.vpoNumber || 'draft').replace(/[^a-z0-9-_]/gi, '_');
    const supplierInitials = getSupplierInitials(formData.supplierName);
    return mode === 'vendor'
      ? `VENDOR-PO-${safeVpo}-${supplierInitials}.${ext}`
      : `PO-${safeVpo}-${supplierInitials}.${ext}`;
  };

  const handleSaveJson = () => {
    const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getSafeFilename('json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getExportUnitPrice = (item: ExtractedOrderData['items'][number], mode: PriceMode) => {
    if (mode === 'vendor') return item.vendorUnitPrice ? Number(item.vendorUnitPrice) : null;
    return Number(item.customerUnitPrice ?? item.unitPrice ?? 0);
  };

  const getExportLineTotal = (item: ExtractedOrderData['items'][number], mode: PriceMode) => {
    const unitPrice = getExportUnitPrice(item, mode);
    if (unitPrice === null) return null;
    return unitPrice * Number(item.totalQty || 0);
  };

  const handleDownloadExcel = async (mode: PriceMode = 'customer') => {
    const Workbook = (await import('exceljs')).default.Workbook;
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet(mode === 'vendor' ? 'Vendor PO' : 'Purchase Order');

    // Layout setup - Wider columns
    worksheet.columns = [
      { header: '', key: 'A', width: 22 }, // Product Code - Reduced for print fit
      { header: '', key: 'B', width: 45 }, // Description / Values
      { header: '', key: 'C', width: 15 }, // Color
      { header: '', key: 'D', width: 35 }, // Material
      { header: '', key: 'E', width: 10 }, // Qty - Reduced
      { header: '', key: 'F', width: 12 }, // Unit Price - Reduced
      { header: '', key: 'G', width: 15 }, // Total - Reduced
    ];

    // Helper styles
    const boldFont = { bold: true };
    const borderBottom = { bottom: { style: 'thin' } } as const;
    const borderThickBottom = { bottom: { style: 'thick' } } as const;
    const alignRight = { horizontal: 'right' } as const;
    const alignCenter = { horizontal: 'center' } as const;
    const wrapText = { wrapText: true, vertical: 'top' } as const;

    // Title
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = mode === 'vendor' ? 'VENDOR PURCHASE ORDER' : 'PURCHASE ORDER';
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = alignCenter;
    worksheet.addRow([]);

    // Header Info Grid
    // Row 3: Order # | Date
    worksheet.mergeCells('A3:B3'); // Label + Value
    worksheet.getCell('A3').value = `PO #: ${formData.vpoNumber || 'DRAFT'}`;
    worksheet.getCell('A3').font = { size: 12, bold: true };

    worksheet.mergeCells('E3:G3');
    worksheet.getCell('E3').value = `Date: ${formData.orderDate || ''}`;
    worksheet.getCell('E3').alignment = alignRight;

    // Row 4: Customer Name (Merged A-D for width) | Ship Date
    worksheet.mergeCells('A4:D4');
    worksheet.getCell('A4').value = `Customer: ${formData.customerName || ''}`;
    worksheet.getCell('A4').alignment = wrapText;

    // Row 4 Right: Ship Date
    worksheet.mergeCells('E4:G4');
    worksheet.getCell('E4').value = `Ship Date: ${formData.expShipDate || ''}`;
    worksheet.getCell('E4').alignment = alignRight;

    // Row 5-6: Address (Merged A-D for width & height) | R Whs Date & Ref
    worksheet.mergeCells('A5:D6');
    worksheet.getCell('A5').value = `Address: ${formData.customerAddress || ''}`;
    worksheet.getCell('A5').alignment = wrapText;

    // Row 5 Right: R Whs Date
    worksheet.mergeCells('E5:G5');
    worksheet.getCell('E5').value = `R Whs Date: ${formData.cancelDate || ''}`;
    worksheet.getCell('E5').alignment = alignRight;

    // Row 6 Right: Ref
    worksheet.mergeCells('E6:G6');
    worksheet.getCell('E6').value = `Ref: ${formData.soReference || ''}`;
    worksheet.getCell('E6').alignment = alignRight;

    worksheet.addRow([]); // Row 7 Spacer

    // Supplier & Ship To Section
    const sectionRowIdx = 8;
    const sectionRow = worksheet.getRow(sectionRowIdx);
    sectionRow.values = ['SUPPLIER', '', '', '', 'SHIP TO'];
    sectionRow.font = boldFont;

    worksheet.mergeCells(`A${sectionRowIdx}:C${sectionRowIdx}`); // Supplier Header spans A-C
    worksheet.getCell(`A${sectionRowIdx}`).border = borderBottom;

    worksheet.mergeCells(`E${sectionRowIdx}:G${sectionRowIdx}`); // Ship To Header spans E-G
    worksheet.getCell(`E${sectionRowIdx}`).border = borderBottom;

    // Addresses - Combine Name and Address for Excel Merged Cells
    const addrRowIdx = 9;
    const supplierText = [formData.supplierName, formData.supplierAddress]
      .filter(Boolean)
      .join('\n');
    const shipToText = formData.shipTo || '';

    worksheet.getRow(addrRowIdx).values = [supplierText, '', '', '', shipToText];

    // Clear the next row to avoid interference (though merging handles it, it's cleaner)
    worksheet.getRow(addrRowIdx + 1).values = ['', '', '', '', ''];

    // Merge address cells for better text wrapping
    worksheet.mergeCells(`A${addrRowIdx}:C${addrRowIdx + 1}`); // Supplier Info Block
    worksheet.getCell(`A${addrRowIdx}`).alignment = { vertical: 'top', wrapText: true };

    worksheet.mergeCells(`E${addrRowIdx}:G${addrRowIdx + 1}`); // Ship To Info Block
    worksheet.getCell(`E${addrRowIdx}`).alignment = { vertical: 'top', wrapText: true };

    worksheet.addRow([]); // Spacer
    worksheet.addRow([]); // Spacer for multi-line address

    // Terms Section
    const termsStartRow = 12;
    worksheet.mergeCells(`A${termsStartRow}:B${termsStartRow}`);
    worksheet.getCell(`A${termsStartRow}`).value = `Ship Via: ${formData.shipVia || ''}`;

    worksheet.mergeCells(`C${termsStartRow}:D${termsStartRow}`);
    worksheet.getCell(`C${termsStartRow}`).value = `Terms: ${formData.shipmentTerms || ''}`;

    worksheet.mergeCells(`E${termsStartRow}:G${termsStartRow}`);
    worksheet.getCell(`E${termsStartRow}`).value = `Payment: ${formData.paymentTerms || ''}`;

    // Agent removed per request
    // worksheet.getCell(`G${termsStartRow}`).value = `Agent: ${formData.agent || ''}`;

    worksheet.getRow(termsStartRow).font = { size: 10 };
    worksheet.addRow([]);

    // Items Table Header
    const headerRow = worksheet.addRow([
      'Product Code',
      'Description',
      'Color',
      'Material',
      'Qty',
      'Unit Price',
      'Total',
    ]);
    let firstItemRowNumber = -1;
    let lastItemRowNumber = -1;
    headerRow.font = boldFont;
    headerRow.eachCell((cell) => {
      cell.border = borderThickBottom;
      cell.alignment = { vertical: 'middle' };
    });
    headerRow.getCell(5).alignment = alignCenter; // Qty header
    headerRow.getCell(6).alignment = alignRight;
    headerRow.getCell(7).alignment = alignRight;

    // Items
    formData.items.forEach((item) => {
      const lineUnitPrice = getExportUnitPrice(item, mode);
      const lineTotal = getExportLineTotal(item, mode);
      const row = worksheet.addRow([
        item.productCode,
        item.description,
        item.color,
        item.material,
        item.totalQty,
        lineUnitPrice !== null ? lineUnitPrice : '',
        lineTotal !== null ? lineTotal : '', // Placeholder, will update with formula
      ]);

      // Track item rows for SUM formula
      if (firstItemRowNumber === -1) firstItemRowNumber = row.number;
      lastItemRowNumber = row.number;

      // Set Formula for Line Total (Column G = Column E * Column F)
      if (lineUnitPrice !== null && lineTotal !== null) {
        row.getCell(7).value = {
          formula: `E${row.number}*F${row.number}`,
          result: lineTotal,
        };
      } else {
        row.getCell(7).value = '';
      }

      row.getCell(2).alignment = wrapText; // Wrap Description
      row.getCell(4).alignment = wrapText; // Wrap Material
      row.getCell(5).alignment = alignCenter; // Qty
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(7).numFmt = '"$"#,##0.00';

      if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
        const sizes = Object.entries(item.sizeBreakdown)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        const sizeRow = worksheet.addRow(['', `Sizes: ${sizes}`]);
        sizeRow.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
        worksheet.mergeCells(`B${sizeRow.number}:G${sizeRow.number}`); // Merge for long size string
        sizeRow.getCell(2).alignment = wrapText;
      }
    });

    // Totals
    worksheet.addRow([]);
    const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
    const totalAmount = formData.items.reduce(
      (sum, item) => sum + (getExportLineTotal(item, mode) || 0),
      0
    );

    const totalRow = worksheet.addRow(['', '', '', 'TOTAL', totalQty, '', totalAmount]);

    // Apply Formulas to Totals if items exist
    if (firstItemRowNumber !== -1 && lastItemRowNumber !== -1) {
      // Total Qty Formula (Sum of E)
      totalRow.getCell(5).value = {
        formula: `SUM(E${firstItemRowNumber}:E${lastItemRowNumber})`,
        result: totalQty,
      };
      // Grand Total Formula (Sum of G)
      totalRow.getCell(7).value = {
        formula: `SUM(G${firstItemRowNumber}:G${lastItemRowNumber})`,
        result: totalAmount,
      };
    }
    totalRow.font = boldFont;
    totalRow.getCell(4).alignment = alignRight;
    totalRow.getCell(5).alignment = alignCenter;
    totalRow.getCell(7).numFmt = '"$"#,##0.00';

    // Add top border to total row
    ['D', 'E', 'F', 'G'].forEach((col) => {
      totalRow.getCell(col).border = { top: { style: 'thin' } };
    });

    // Add Legal Lines
    worksheet.addRow([]);
    const legalRow = worksheet.addRow([
      '',
      "Terms & Conditions: 1. Acceptance of this Purchase Order (PO) constitutes a binding contract subject to Buyer's standard terms. 2. Time is of the essence; Buyer reserves the right to cancel or apply penalties for late deliveries. 3. Goods must strictly conform to specifications, quality standards, and all applicable safety laws. 4. Buyer reserves the right to inspect and reject non-conforming goods at Seller's expense. 5. Seller shall indemnify and hold Buyer harmless against all claims, including third-party intellectual property claims. 6. Payment terms begin upon receipt of a correct invoice and conforming goods. 7. WARNING- To ensure compliance with U.S. and other laws, all products supplied to or on behalf of buyer anywhere in the world must not include any labor, materials or components originating from, or produced in, Uzbekistan, Turkmenistan, Or China XUAR Xinjiang Province, or otherwise involving any party on a U.S. government’s XUAR-related entities list. Products will be randomly tested for component origin. Non-compliance will result in the immediate cancellation of orders and a penalty equal to no less than two times the contracted value of the products.",
    ]);
    legalRow.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
    worksheet.mergeCells(`B${legalRow.number}:G${legalRow.number}`);
    legalRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    legalRow.height = 120; // More height for much longer text

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = getSafeFilename('xlsx', mode);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  };

  const handleDownloadPdf = async (mode: PriceMode = 'customer') => {
    try {
      const jsPDF = (await import('jspdf')).default;
      const autoTable = (await import('jspdf-autotable')).default;

      const doc = new jsPDF();

      // 1. Title
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(mode === 'vendor' ? 'VENDOR PURCHASE ORDER' : 'PURCHASE ORDER', 105, 20, {
        align: 'center',
      });

      // 2. Header Info (Order #, Date, etc)
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`PO #: ${formData.vpoNumber || 'DRAFT'}`, 14, 35);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${formData.orderDate || ''}`, 190, 35, { align: 'right' });

      doc.text(`Customer: ${formData.customerName || ''}`, 14, 42);
      doc.text(`Ship Date: ${formData.expShipDate || ''}`, 190, 42, { align: 'right' });

      doc.text(`Address: ${formData.customerAddress || ''}`, 14, 49, { maxWidth: 100 });
      doc.text(`R Whs Date: ${formData.cancelDate || ''}`, 190, 49, { align: 'right' });

      doc.text(`Ref: ${formData.soReference || ''}`, 190, 56, { align: 'right' });

      // 3. Supplier & Ship To Details
      let yPos = 70;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUPPLIER', 14, yPos);
      doc.text('SHIP TO', 110, yPos);

      doc.line(14, yPos + 1, 90, yPos + 1); // Underline Supplier
      doc.line(110, yPos + 1, 190, yPos + 1); // Underline Ship To

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos += 6;

      // Dynamic Address Blocks
      const supplierLines = doc.splitTextToSize(
        [formData.supplierName || '', formData.supplierAddress || ''].join('\n'),
        80
      );
      const shipToLines = doc.splitTextToSize(formData.shipTo || '', 80);

      doc.text(supplierLines, 14, yPos);
      doc.text(shipToLines, 110, yPos);

      // Calculate height of addresses to adjust Y position
      const addressBlockHeight = Math.max(supplierLines.length, shipToLines.length) * 5; // approx 5pts per line
      yPos += Math.max(25, addressBlockHeight + 10);

      // 4. Terms & Conditions Line
      doc.setFontSize(9);
      const termsY = yPos;
      doc.text(`Ship Via: ${formData.shipVia || ''}`, 14, termsY);
      doc.text(`Terms: ${formData.shipmentTerms || ''}`, 70, termsY);
      doc.text(`Payment: ${formData.paymentTerms || ''}`, 120, termsY);
      // doc.text(`Agent: ${formData.agent || ''}`, 165, termsY); // Removed Agent

      yPos += 5;

      // 5. Items Table using autoTable
      const tableColumn = [
        'Product Code',
        'Description',
        'Color',
        'Material',
        'Qty',
        'Unit Price',
        'Total',
      ];
      type PdfTableCell =
        | string
        | number
        | {
          content: string | number;
          colSpan?: number;
          styles?: {
            fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
            textColor?: [number, number, number];
            halign?: 'left' | 'center' | 'right';
          };
        };
      type PdfTableRow = PdfTableCell[];
      const tableRows: PdfTableRow[] = [];

      formData.items.forEach((item) => {
        const lineUnitPrice = getExportUnitPrice(item, mode);
        const lineTotal = getExportLineTotal(item, mode);
        const rowData = [
          item.productCode || '',
          item.description || '',
          item.color || '',
          item.material || '',
          item.totalQty,
          lineUnitPrice !== null ? `$${lineUnitPrice.toFixed(2)}` : '',
          lineTotal !== null ? `$${lineTotal.toFixed(2)}` : '',
        ];
        tableRows.push(rowData);

        // Size breakdown row (italic)
        if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
          const sizes = Object.entries(item.sizeBreakdown)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
          // Add a row specifically for sizes - spanned manually via string concat or visual row
          tableRows.push([
            {
              content: `Sizes: ${sizes}`,
              colSpan: 7,
              styles: { fontStyle: 'italic', textColor: [100, 100, 100] },
            },
          ]);
        }
      });

      // Totals Row
      const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
      const totalAmount = formData.items.reduce(
        (sum, item) => sum + (getExportLineTotal(item, mode) || 0),
        0
      );

      tableRows.push([
        '',
        '',
        '',
        'TOTAL',
        { content: totalQty, styles: { halign: 'center', fontStyle: 'bold' } },
        '',
        { content: `$${totalAmount.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [tableColumn],
        body: tableRows,
        theme: 'grid',
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
          lineColor: [200, 200, 200],
        },
        styles: { fontSize: 9, cellPadding: 2, lineColor: [200, 200, 200], overflow: 'linebreak' }, // Enable wrapping
        margin: { bottom: 40 }, // Reserve space for legal text footer
        columnStyles: {
          0: { cellWidth: 18 }, // Product Code
          1: { cellWidth: 'auto' }, // Description
          2: { cellWidth: 20 }, // Color
          3: { cellWidth: 35 }, // Material
          4: { cellWidth: 18, halign: 'center' }, // Qty
          5: { cellWidth: 22, halign: 'right' }, // Unit Price
          6: { cellWidth: 28, halign: 'right' }, // Total
        },
      });

      // 5.5 Legal Lines (Flowing after table)
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 100);

      const legalLines = [
        "Terms & Conditions: 1. Acceptance of this Purchase Order (PO) constitutes a binding contract subject to Buyer's standard terms. 2. Time is of the essence; Buyer reserves the right to cancel or apply penalties for late deliveries.",
        "3. Goods must strictly conform to specifications, quality standards, and all applicable safety laws. 4. Buyer reserves the right to inspect and reject non-conforming goods at Seller's expense.",
        '5. Seller shall indemnify and hold Buyer harmless against all claims, including third-party intellectual property claims. 6. Payment terms begin upon receipt of a correct invoice and conforming goods.',
        '7. WARNING- To ensure compliance with U.S. and other laws, all products supplied to or on behalf of buyer anywhere in the world must not include any labor, materials or components originating from, or produced in, Uzbekistan, Turkmenistan, Or China XUAR Xinjiang Province, or otherwise involving any party on a U.S. government’s XUAR-related entities list. Products will be randomly tested for component origin. Non-compliance will result in the immediate cancellation of orders and a penalty equal to no less than two times the contracted value of the products.',
      ];
      const splitLegal = doc.splitTextToSize(legalLines.join(' '), 180);

      // Determine Y position
      const docWithAutoTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
      let legalY = (docWithAutoTable.lastAutoTable?.finalY ?? yPos) + 10;
      const textHeight = splitLegal.length * 3; // Approx 3mm per line (font size 7)

      // Check if we need a new page
      if (legalY + textHeight > pageHeight - 10) {
        doc.addPage();
        legalY = 20; // Start at top of new page
      }

      doc.text(splitLegal, 14, legalY);

      // 6. Customer Notes (Page 2)
      if (formData.customerNotes) {
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Customer Notes', 14, 20);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(formData.customerNotes, 180);
        doc.text(splitNotes, 14, 30);
      }

      // Save PDF
      doc.save(getSafeFilename('pdf', mode));
    } catch (error: unknown) {
      console.error('PDF Export failed', error);
      setAlertConfig({
        open: true,
        title: 'Export Failed',
        message: 'Failed to export PDF.',
        isError: true,
      });
    }
  };

  const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
  const totalAmount = formData.items.reduce(
    (sum, item) =>
      sum + Number(item.customerUnitPrice ?? item.unitPrice ?? 0) * Number(item.totalQty || 0),
    0
  );
  const totalVendorCost = formData.items.reduce(
    (sum, item) => sum + Number(item.vendorUnitPrice || 0) * Number(item.totalQty || 0),
    0
  );
  const uniqueStyles = new Set(formData.items.map((item) => item.productCode).filter(Boolean)).size;

  // UI State for "Popups"
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    open: boolean;
    title: string;
    message: string;
    isError?: boolean;
  }>({
    open: false,
    title: '',
    message: '',
  });

  // Tab state
  const [activeTab, setActiveTab] = useState('summary');

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="border-b px-5 py-3 bg-background/95 backdrop-blur flex justify-between items-center shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {formData.vpoNumber ? formData.vpoNumber : 'Order Details'}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isLoading ? (
                processingStep || 'Processing...'
              ) : data ? (
                <span className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-500" /> AI extracted — review & edit
                </span>
              ) : (
                'Upload a PDF to get started'
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!data && formData.items.length === 0}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm"
            onClick={async (e) => {
              e.preventDefault();
              try {
                const dbPayload = {
                  ...formData,
                  vpoNumber: data?.vpoNumber || formData.vpoNumber,
                  customerName: data?.customerName || formData.customerName,
                  customerAddress: data?.customerAddress || formData.customerAddress,
                  shipmentTerms: data?.shipmentTerms || formData.shipmentTerms,
                  paymentTerms: data?.paymentTerms || formData.paymentTerms,
                  items: formData.items,
                };

                const res = await fetch('/api/save-order', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(dbPayload),
                });

                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error || 'Failed to save');
                }

                setAlertConfig({
                  open: true,
                  title: 'Success',
                  message: 'Order saved to Dashboard!',
                  isError: false,
                });
                setIsSaved(true);
              } catch (e: unknown) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                setAlertConfig({
                  open: true,
                  title: 'Save Failed',
                  message: `Failed to save order: ${errorMessage}`,
                  isError: true,
                });
                console.error('Save Error:', e);
              }
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>

          <DropdownMenu
            modal={false}
            open={isMenuOpen}
            onOpenChange={(open) => {
              if (open && !isSaved) {
                setAlertConfig({
                  open: true,
                  title: 'Action Required',
                  message: 'You must save the order first before generating a Vendor PO.',
                  isError: true,
                });
                setIsMenuOpen(false);
              } else {
                setIsMenuOpen(open);
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-sm"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Generate Vendor PO
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Export Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSaveJson}>
                <Download className="h-4 w-4 mr-2" />
                Save as JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownloadExcel('vendor')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export Vendor PO (Excel FOB)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDownloadPdf('vendor')}>
                <FileText className="h-4 w-4 mr-2" />
                Export Vendor PO (PDF FOB)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Error Display ──────────────────────────────── */}
      {error && (
        <div className="mx-5 mt-3 flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Error</p>
            <p className="text-destructive/80 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Summary Metric Cards ───────────────────────── */}
      {formData.items.length > 0 && (
        <div className="grid grid-cols-3 gap-3 px-5 pt-4 pb-2 shrink-0">
          <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Pcs</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">{totalQty.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{uniqueStyles} styles</p>
          </div>
          <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Sales Value</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ${(totalAmount / (totalQty || 1)).toFixed(2)} avg/pc
            </p>
          </div>
          <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Vendor Cost</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              ${totalVendorCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-muted-foreground">
              ${(totalVendorCost / (totalQty || 1)).toFixed(2)} avg/pc
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex gap-0 px-5 border-b shrink-0">
          {(['summary', 'items', 'shipping', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                }`}
            >
              {tab === 'items' ? `Items (${formData.items.length})` : tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5">

            {/* ═══ TAB: Summary ═══════════════════════════ */}
            {activeTab === 'summary' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                {/* Raw Text Toggle */}
                {rawText && (
                  <div className="border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowRawText(!showRawText)}
                      className="w-full flex items-center justify-between p-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">RAW</Badge>
                        <span className="text-xs">Extracted Text ({rawText.split('\n').filter(Boolean).length} lines)</span>
                      </div>
                      {showRawText ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showRawText && (
                      <pre className="p-3 text-xs text-muted-foreground bg-muted/10 max-h-48 overflow-auto whitespace-pre-wrap font-mono border-t">
                        {rawText}
                      </pre>
                    )}
                  </div>
                )}

                {/* Order Information Card */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Order Information</h3>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">VPO Number</Label>
                      <Input
                        value={formData.vpoNumber || ''}
                        onChange={(e) => updateField('vpoNumber', e.target.value)}
                        placeholder="VPO-XXXXXXX"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Order Date</Label>
                      <Input
                        value={formData.orderDate || ''}
                        onChange={(e) => updateField('orderDate', e.target.value)}
                        placeholder="MM/DD/YYYY"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">SO Reference</Label>
                      <Input
                        value={formData.soReference || ''}
                        onChange={(e) => updateField('soReference', e.target.value)}
                        placeholder="SO-XXXXXXX"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Exp Ship Date</Label>
                      <Input
                        value={formData.expShipDate || ''}
                        onChange={(e) => updateField('expShipDate', e.target.value)}
                        placeholder="MM/DD/YYYY"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">R Whs Date</Label>
                      <Input
                        value={formData.cancelDate || ''}
                        onChange={(e) => updateField('cancelDate', e.target.value)}
                        placeholder="MM/DD/YYYY"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Buyer & Supplier Cards side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Buyer Card */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold">
                        {formData.customerName === BUYER_OPTIONS.HK.name ? 'HK' : 'NY'}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Buyer</h3>
                        <p className="text-[11px] text-muted-foreground">Bill To</p>
                      </div>
                    </div>
                    <Select
                      value={formData.customerName === BUYER_OPTIONS.HK.name ? 'HK' : 'NY'}
                      onValueChange={(val) => {
                        const selected = val === 'HK' ? BUYER_OPTIONS.HK : BUYER_OPTIONS.NY;
                        setFormData((prev) => ({
                          ...prev,
                          customerName: selected.name,
                          customerAddress: selected.address,
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select Buyer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NY">Mijenro International LLC (NY)</SelectItem>
                        <SelectItem value="HK">Mijenro Hongkong Ltd (HK)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea
                      value={formData.customerAddress || ''}
                      readOnly
                      className="min-h-[50px] text-xs bg-muted/30 resize-none"
                    />
                  </div>

                  {/* Supplier Card */}
                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold">
                        {getSupplierInitials(formData.supplierName)}
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Supplier</h3>
                        <p className="text-[11px] text-muted-foreground">Factory</p>
                      </div>
                    </div>
                    <Input
                      value={formData.supplierName || ''}
                      onChange={(e) => updateField('supplierName', e.target.value)}
                      placeholder="Supplier name"
                      className="h-8 text-sm"
                    />
                    <Input
                      value={formData.supplierAddress || ''}
                      onChange={(e) => updateField('supplierAddress', e.target.value)}
                      placeholder="Supplier address"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TAB: Items ═════════════════════════════ */}
            {activeTab === 'items' && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Line Items</h3>
                    {formData.items.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        {totalQty.toLocaleString()} pcs · ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} sales
                      </Badge>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                  </Button>
                </div>

                {formData.items.length === 0 ? (
                  <div className="border-2 border-dashed rounded-xl p-10 text-center bg-muted/5">
                    <Package className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">No items yet</p>
                    <Button variant="outline" size="sm" onClick={addItem}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add First Item
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.items.map((item, idx) => (
                      <div key={idx} className="border rounded-xl overflow-hidden bg-card">
                        {/* Item Header Row */}
                        <div className="grid grid-cols-[1fr_1.5fr_90px_90px_90px_110px_36px] gap-2 p-2.5 items-center text-sm">
                          <Input
                            className="h-7 text-xs font-mono"
                            placeholder="Product Code"
                            value={item.productCode}
                            onChange={(e) => updateItem(idx, 'productCode', e.target.value)}
                          />
                          <Input
                            className="h-7 text-xs"
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          />
                          <Input
                            type="number"
                            className="h-7 text-xs text-right"
                            placeholder="Qty"
                            value={item.totalQty || ''}
                            onChange={(e) => updateItem(idx, 'totalQty', Number(e.target.value))}
                          />
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 text-xs text-right"
                            placeholder="Cust $"
                            value={(item.customerUnitPrice ?? item.unitPrice) || ''}
                            onChange={(e) =>
                              updateItem(idx, 'customerUnitPrice', Number(e.target.value))
                            }
                          />
                          <Input
                            type="number"
                            step="0.01"
                            className="h-7 text-xs text-right"
                            placeholder="Vendor $"
                            value={item.vendorUnitPrice || ''}
                            onChange={(e) => updateItem(idx, 'vendorUnitPrice', Number(e.target.value))}
                          />
                          <div className="text-xs text-right font-medium pr-1 tabular-nums">
                            ${(Number((item.customerUnitPrice ?? item.unitPrice) || 0) * Number(item.totalQty || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            onClick={() => toggleItemExpand(idx)}
                          >
                            {expandedItems.has(idx) ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>

                        {/* Item Details (expandable) */}
                        {expandedItems.has(idx) && (
                          <div className="p-3 border-t bg-muted/5 space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Color</Label>
                                <Input
                                  className="h-7 text-xs"
                                  value={item.color || ''}
                                  onChange={(e) => updateItem(idx, 'color', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Collection</Label>
                                <Input
                                  className="h-7 text-xs"
                                  value={item.collection || ''}
                                  onChange={(e) => updateItem(idx, 'collection', e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Tariff Key</Label>
                                <div className="h-7 rounded-md border bg-muted/30 px-2 text-[10px] flex items-center truncate">
                                  {getEstimate(item).baseTariffKey}
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Material</Label>
                                <Input
                                  className="h-7 text-xs"
                                  value={item.material || ''}
                                  onChange={(e) => updateItem(idx, 'material', e.target.value)}
                                />
                              </div>
                            </div>


                            {/* Per-Unit Cost Breakdown */}
                            {(() => {
                              const est = getEstimate(item);
                              return (
                                <div className="text-[10px] rounded-lg border bg-muted/10 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                                  <div>
                                    <span className="text-muted-foreground">Tariff Key: </span>
                                    <span className="font-medium" title={est.baseTariffKey}>{est.baseTariffKey}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Duty Rate: </span>
                                    <span className="font-medium">{(est.tariffRate * 100).toFixed(1)}%</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">3PL Duty/pc: </span>
                                    <span className="font-medium">${est.handlingPerUnit.toFixed(3)}</span>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">3PL Ship/pc: </span>
                                    <span className="font-medium">$0.100</span>
                                  </div>
                                  <div className="font-semibold col-span-2">
                                    <span className="text-muted-foreground">3PL Total/pc: </span>
                                    <span>${est.est3plPerUnit.toFixed(3)}</span>
                                    <span className="text-muted-foreground ml-1"> — Total: ${est.est3pl.toFixed(2)}</span>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Size Breakdown */}
                            {item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0 && (
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground">Size Breakdown</Label>
                                <div className="flex flex-wrap gap-1.5">
                                  {Object.entries(item.sizeBreakdown).map(([size, qty]) => (
                                    <div key={size} className="flex items-center gap-1 bg-muted/40 rounded-md px-2 py-0.5 text-[10px]">
                                      <span className="font-medium">{size}:</span>
                                      <span>{qty}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => removeItem(idx)}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Totals Bar */}
                    <div className="flex justify-end gap-5 p-3 bg-muted/20 rounded-xl text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Qty:</span>{' '}
                        <span className="font-semibold tabular-nums">{totalQty.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Sales:</span>{' '}
                        <span className="font-semibold tabular-nums">
                          ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Vendor Cost:</span>{' '}
                        <span className="font-semibold tabular-nums">
                          ${totalVendorCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ═══ TAB: Shipping ══════════════════════════ */}
            {activeTab === 'shipping' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Shipping & Terms</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Ship To</Label>
                      <Input
                        value={formData.shipTo || ''}
                        onChange={(e) => updateField('shipTo', e.target.value)}
                        placeholder="Ship-to address"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Ship Via</Label>
                      <Input
                        value={formData.shipVia || ''}
                        onChange={(e) => updateField('shipVia', e.target.value)}
                        placeholder="e.g. Ocean Frt"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Shipment Terms</Label>
                      <Input
                        value={formData.shipmentTerms || ''}
                        onChange={(e) => updateField('shipmentTerms', e.target.value)}
                        placeholder="e.g. FOB"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Payment Terms
                      </Label>
                      <Select
                        value={formData.paymentTerms || ''}
                        onValueChange={(val) => updateField('paymentTerms', val)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Select Terms" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_TERMS.map((term) => (
                            <SelectItem key={term} value={term}>
                              {term}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ TAB: Notes ════════════════════════════ */}
            {activeTab === 'notes' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Customer Notes</h3>
                  </div>
                  <Textarea
                    placeholder="Enter notes here (will appear on a separate page in PDF export)..."
                    value={formData.customerNotes || ''}
                    onChange={(e) => updateField('customerNotes', e.target.value)}
                    className="min-h-[200px] text-sm"
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      <PoPreviewDialog open={isPoPreviewOpen} onOpenChange={setIsPoPreviewOpen} data={formData} />

      {/* General Alert Dialog */}
      <Dialog
        open={alertConfig.open}
        onOpenChange={(open) => setAlertConfig((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={alertConfig.isError ? 'text-destructive' : ''}>
              {alertConfig.title}
            </DialogTitle>
            <DialogDescription>{alertConfig.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setAlertConfig((prev) => ({ ...prev, open: false }))}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
