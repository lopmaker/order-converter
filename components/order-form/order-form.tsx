'use client';

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
// import { ScrollArea } from "@/components/ui/scroll-area"; // Removed to fix scrolling
import { Badge } from "@/components/ui/badge";
import {
    FileText, Save, Send, Loader2, AlertCircle,
    ChevronDown, ChevronUp, Plus, Trash2, Sparkles,
    Package, Truck, Building2, CreditCard, Download, FileSpreadsheet, User
} from "lucide-react";
import { ExtractedOrderData, OrderItem } from "@/lib/parser";
import { useEffect, useState } from "react";
import { PoPreviewDialog } from "@/components/po-preview/po-preview-dialog";
import * as XLSX from 'xlsx';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OrderFormProps {
    data?: ExtractedOrderData;
    isLoading?: boolean;
    processingStep?: string;
    rawText?: string;
    error?: string;
}

const BUYER_OPTIONS = {
    NY: {
        name: "Mijenro International LLC",
        address: "10740 Queens Blvd\nForest Hills, NY 11375"
    },
    HK: {
        name: "Mijenro Hongkong Ltd",
        address: "Room 704, 7/F., Tower A, New Mandarin Plaza, 14 Science Museum Road, TST East, Kowloon, Hong Kong"
    }
};

const PAYMENT_TERMS = [
    "Net 60 days",
    "Net 90 days"
];

export function OrderForm({ data, isLoading, processingStep, rawText, error }: OrderFormProps) {
    // Data Refinement Logic on Init
    const initializeData = (inputData?: ExtractedOrderData): ExtractedOrderData => {
        if (!inputData) return { items: [] };

        const refined = { ...inputData };

        // 1. VPO Number: Strip "VPO" and Append "M"
        if (refined.vpoNumber) {
            // Remove "VPO" prefix/text (case-insensitive) and hyphens/spaces
            let cleanVpo = refined.vpoNumber.replace(/vpo/yi, '').replace(/-/g, '').trim();
            if (!cleanVpo.endsWith('M')) {
                cleanVpo = `${cleanVpo}M`;
            }
            refined.vpoNumber = cleanVpo;
        }

        // 2. Buyer Address: Ignore PDF, default to NY (will be overridden by Kanglong logic if needed)
        refined.customerName = BUYER_OPTIONS.NY.name;
        refined.customerAddress = BUYER_OPTIONS.NY.address;

        // 3. Shipment Terms: Default to FOB
        refined.shipmentTerms = "FOB";

        // 4. Payment Terms: Default to Net 90 days (will be overridden by Junheng logic if needed)
        refined.paymentTerms = "Net 90 days";

        return refined;
    };

    const [formData, setFormData] = useState<ExtractedOrderData>(initializeData(data));
    const [isPoPreviewOpen, setIsPoPreviewOpen] = useState(false);
    const [showRawText, setShowRawText] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

    // Update form when new data is loaded
    useEffect(() => {
        if (data) {
            setFormData(initializeData(data));
        }
    }, [data]);

    // Auto-switch Buyer based on Supplier
    useEffect(() => {
        if (formData.supplierName?.toLowerCase()?.includes('kanglong')) {
            setFormData(prev => ({
                ...prev,
                customerName: BUYER_OPTIONS.HK.name,
                customerAddress: BUYER_OPTIONS.HK.address
            }));
        } else {
            // Default to NY if not Kanglong (and if not already set to something specific, but requirement implies strict rule)
            // We'll set it to NY if it's currently empty or was previously auto-set.
            // To be safe and simple per request: "all other supplier will use Mijenro international LLC"
            setFormData(prev => {
                // Only override if it matches HK (switching back) or is empty.
                // Or force it every time supplier changes to something else?
                // User said: "all other supplier will use Mijenro international LLC" -> implies strict rule.
                if (prev.customerName === BUYER_OPTIONS.HK.name || !prev.customerName) {
                    return {
                        ...prev,
                        customerName: BUYER_OPTIONS.NY.name,
                        customerAddress: BUYER_OPTIONS.NY.address
                    };
                }
                return prev;
            });
        }

    }, [formData.supplierName]);

    // Auto-set Payment Terms based on Supplier
    useEffect(() => {
        if (formData.supplierName?.toLowerCase()?.includes('junheng')) {
            setFormData(prev => ({ ...prev, paymentTerms: "Net 60 days" }));
        } else {
            // Default back to Net 90 days if not Junheng (and if it was likely auto-set or empty)
            setFormData(prev => {
                if (prev.paymentTerms === "Net 60 days" || !prev.paymentTerms) {
                    return { ...prev, paymentTerms: "Net 90 days" };
                }
                return prev;
            });
        }
    }, [formData.supplierName]);

    const updateField = (field: keyof ExtractedOrderData, value: any) => {
        setFormData({ ...formData, [field]: value });
    };

    const addItem = () => {
        setFormData({
            ...formData,
            items: [...formData.items, {
                productCode: '', description: '', productClass: '',
                collection: '', material: '', color: '',
                unitPrice: 0, totalQty: 0, extension: 0,
            }]
        });
    };

    const removeItem = (index: number) => {
        setFormData({
            ...formData,
            items: formData.items.filter((_, i) => i !== index)
        });
        expandedItems.delete(index);
        setExpandedItems(new Set(expandedItems));
    };

    const updateItem = (index: number, field: string, value: string | number) => {
        const newItems = [...formData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        // Auto-calc extension
        if (field === 'unitPrice' || field === 'totalQty') {
            newItems[index].extension = Number(newItems[index].unitPrice) * Number(newItems[index].totalQty);
        }
        setFormData({ ...formData, items: newItems });
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
        return name.split(' ')
            .map(word => word[0])
            .join('')
            .toUpperCase()
            .substring(0, 3) || 'XX';
    };

    const getSafeFilename = (prefix: string, ext: string) => {
        const safeVpo = (formData.vpoNumber || 'draft').replace(/[^a-z0-9-_]/gi, '_');
        const supplierInitials = getSupplierInitials(formData.supplierName);
        // Format: PO-{vpo}-{initials}.{ext}
        // Note: User requested 'PO' prefix explicitly, replacing generic 'order' prefix logic if needed, 
        // but function accepts prefix. We will pass 'PO' when calling this.
        return `PO-${safeVpo}-${supplierInitials}.${ext}`;
    };

    const handleSaveJson = () => {
        const blob = new Blob([JSON.stringify(formData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = getSafeFilename('PO', 'json');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadExcel = async () => {
        const Workbook = (await import('exceljs')).default.Workbook;
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet('Purchase Order');

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
        titleCell.value = 'PURCHASE ORDER';
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
        const supplierText = [formData.supplierName, formData.supplierAddress].filter(Boolean).join('\n');
        const shipToText = formData.shipTo || '';

        worksheet.getRow(addrRowIdx).values = [
            supplierText, '', '', '',
            shipToText
        ];

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
        const headerRow = worksheet.addRow(['Product Code', 'Description', 'Color', 'Material', 'Qty', 'Unit Price', 'Total']);
        const headerRowNumber = headerRow.number; // Prepare for formulas
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
        formData.items.forEach(item => {
            const row = worksheet.addRow([
                item.productCode,
                item.description,
                item.color,
                item.material,
                item.totalQty,
                item.unitPrice,
                item.extension // Placeholder, will update with formula
            ]);

            // Track item rows for SUM formula
            if (firstItemRowNumber === -1) firstItemRowNumber = row.number;
            lastItemRowNumber = row.number;

            // Set Formula for Line Total (Column G = Column E * Column F)
            // E is 5th, F is 6th, G is 7th
            row.getCell(7).value = {
                formula: `E${row.number}*F${row.number}`,
                result: item.extension
            };

            row.getCell(2).alignment = wrapText; // Wrap Description
            row.getCell(4).alignment = wrapText; // Wrap Material
            row.getCell(5).alignment = alignCenter; // Qty
            row.getCell(6).numFmt = '"$"#,##0.00';
            row.getCell(7).numFmt = '"$"#,##0.00';

            if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
                const sizes = Object.entries(item.sizeBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ");
                const sizeRow = worksheet.addRow(['', `Sizes: ${sizes}`]);
                sizeRow.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
                worksheet.mergeCells(`B${sizeRow.number}:G${sizeRow.number}`); // Merge for long size string
                sizeRow.getCell(2).alignment = wrapText;
            }
        });

        // Totals
        worksheet.addRow([]);
        const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
        const totalAmount = formData.items.reduce((sum, item) => sum + (item.extension || 0), 0);

        const totalRow = worksheet.addRow(['', '', '', 'TOTAL', totalQty, '', totalAmount]);

        // Apply Formulas to Totals if items exist
        if (firstItemRowNumber !== -1 && lastItemRowNumber !== -1) {
            // Total Qty Formula (Sum of E)
            totalRow.getCell(5).value = {
                formula: `SUM(E${firstItemRowNumber}:E${lastItemRowNumber})`,
                result: totalQty
            };
            // Grand Total Formula (Sum of G)
            totalRow.getCell(7).value = {
                formula: `SUM(G${firstItemRowNumber}:G${lastItemRowNumber})`,
                result: totalAmount
            };
        }
        totalRow.font = boldFont;
        totalRow.getCell(4).alignment = alignRight;
        totalRow.getCell(5).alignment = alignCenter;
        totalRow.getCell(7).numFmt = '"$"#,##0.00';

        // Add top border to total row
        ['D', 'E', 'F', 'G'].forEach(col => {
            totalRow.getCell(col).border = { top: { style: 'thin' } };
        });

        // Add Legal Lines
        worksheet.addRow([]);
        const legalRow = worksheet.addRow(['', "Terms & Conditions: 1. Acceptance of this Purchase Order (PO) constitutes a binding contract subject to Buyer's standard terms. 2. Time is of the essence; Buyer reserves the right to cancel or apply penalties for late deliveries. 3. Goods must strictly conform to specifications, quality standards, and all applicable safety laws. 4. Buyer reserves the right to inspect and reject non-conforming goods at Seller's expense. 5. Seller shall indemnify and hold Buyer harmless against all claims, including third-party intellectual property claims. 6. Payment terms begin upon receipt of a correct invoice and conforming goods. 7. WARNING- To ensure compliance with U.S. and other laws, all products supplied to or on behalf of buyer anywhere in the world must not include any labor, materials or components originating from, or produced in, Uzbekistan, Turkmenistan, Or China XUAR Xinjiang Province, or otherwise involving any party on a U.S. government’s XUAR-related entities list. Products will be randomly tested for component origin. Non-compliance will result in the immediate cancellation of orders and a penalty equal to no less than two times the contracted value of the products."]);
        legalRow.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
        worksheet.mergeCells(`B${legalRow.number}:G${legalRow.number}`);
        legalRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        legalRow.height = 120; // More height for much longer text

        // Generate file
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = getSafeFilename('PO', 'xlsx');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleDownloadPdf = async () => {
        try {
            const jsPDF = (await import('jspdf')).default;
            const autoTable = (await import('jspdf-autotable')).default;

            const doc = new jsPDF();

            // 1. Title
            doc.setFontSize(20);
            doc.setFont('helvetica', 'bold');
            doc.text("PURCHASE ORDER", 105, 20, { align: "center" });

            // 2. Header Info (Order #, Date, etc)
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(`PO #: ${formData.vpoNumber || 'DRAFT'}`, 14, 35);
            doc.setFont('helvetica', 'normal');
            doc.text(`Date: ${formData.orderDate || ''}`, 190, 35, { align: "right" });

            doc.text(`Customer: ${formData.customerName || ''}`, 14, 42);
            doc.text(`Ship Date: ${formData.expShipDate || ''}`, 190, 42, { align: "right" });

            doc.text(`Address: ${formData.customerAddress || ''}`, 14, 49, { maxWidth: 100 });
            doc.text(`R Whs Date: ${formData.cancelDate || ''}`, 190, 49, { align: "right" });

            doc.text(`Ref: ${formData.soReference || ''}`, 190, 56, { align: "right" });

            // 3. Supplier & Ship To Details
            let yPos = 70;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text("SUPPLIER", 14, yPos);
            doc.text("SHIP TO", 110, yPos);

            doc.line(14, yPos + 1, 90, yPos + 1); // Underline Supplier
            doc.line(110, yPos + 1, 190, yPos + 1); // Underline Ship To

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            yPos += 6;

            // Dynamic Address Blocks
            const supplierLines = doc.splitTextToSize([formData.supplierName || '', formData.supplierAddress || ''].join('\n'), 80);
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
            const tableColumn = ["Product Code", "Description", "Color", "Material", "Qty", "Unit Price", "Total"];
            const tableRows: any[] = [];

            formData.items.forEach(item => {
                const rowData = [
                    item.productCode,
                    item.description,
                    item.color,
                    item.material,
                    item.totalQty,
                    `$${Number(item.unitPrice).toFixed(2)}`,
                    `$${Number(item.extension).toFixed(2)}`
                ];
                tableRows.push(rowData);

                // Size breakdown row (italic)
                if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
                    const sizes = Object.entries(item.sizeBreakdown).map(([k, v]) => `${k}: ${v}`).join(", ");
                    // Add a row specifically for sizes - spanned manually via string concat or visual row
                    tableRows.push([{ content: `Sizes: ${sizes}`, colSpan: 7, styles: { fontStyle: 'italic', textColor: [100, 100, 100] } }]);
                }
            });

            // Totals Row
            const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
            const totalAmount = formData.items.reduce((sum, item) => sum + (item.extension || 0), 0);

            tableRows.push([
                "", "", "", "TOTAL",
                { content: totalQty, styles: { halign: 'center', fontStyle: 'bold' } },
                "",
                { content: `$${totalAmount.toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } }
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [tableColumn],
                body: tableRows,
                theme: 'grid',
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', lineColor: [200, 200, 200] },
                styles: { fontSize: 9, cellPadding: 2, lineColor: [200, 200, 200], overflow: 'linebreak' }, // Enable wrapping
                columnStyles: {
                    0: { cellWidth: 18 }, // Product Code
                    1: { cellWidth: 'auto' }, // Description
                    2: { cellWidth: 20 }, // Color
                    3: { cellWidth: 35 }, // Material
                    4: { cellWidth: 18, halign: 'center' }, // Qty
                    5: { cellWidth: 22, halign: 'right' }, // Unit Price
                    6: { cellWidth: 28, halign: 'right' }  // Total
                }
            });

            // 5.5 Legal Lines (Footer of Page 1)
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(7);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            const legalLines = [
                "Terms & Conditions: 1. Acceptance of this Purchase Order (PO) constitutes a binding contract subject to Buyer's standard terms. 2. Time is of the essence; Buyer reserves the right to cancel or apply penalties for late deliveries.",
                "3. Goods must strictly conform to specifications, quality standards, and all applicable safety laws. 4. Buyer reserves the right to inspect and reject non-conforming goods at Seller's expense.",
                "5. Seller shall indemnify and hold Buyer harmless against all claims, including third-party intellectual property claims. 6. Payment terms begin upon receipt of a correct invoice and conforming goods.",
                "7. WARNING- To ensure compliance with U.S. and other laws, all products supplied to or on behalf of buyer anywhere in the world must not include any labor, materials or components originating from, or produced in, Uzbekistan, Turkmenistan, Or China XUAR Xinjiang Province, or otherwise involving any party on a U.S. government’s XUAR-related entities list. Products will be randomly tested for component origin. Non-compliance will result in the immediate cancellation of orders and a penalty equal to no less than two times the contracted value of the products."
            ];
            const splitLegal = doc.splitTextToSize(legalLines.join(' '), 180);
            doc.text(splitLegal, 14, pageHeight - 35);

            // 6. Customer Notes (Page 2)
            if (formData.customerNotes) {
                doc.addPage();
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text("Customer Notes", 14, 20);

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                const splitNotes = doc.splitTextToSize(formData.customerNotes, 180);
                doc.text(splitNotes, 14, 30);
            }

            // Save PDF
            doc.save(getSafeFilename('PO', 'pdf'));

        } catch (error) {
            console.error("PDF Export failed", error);
            alert("Failed to export PDF.");
        }
    };

    const totalQty = formData.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
    const totalAmount = formData.items.reduce((sum, item) => sum + (item.extension || 0), 0);

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="border-b p-4 bg-background/95 backdrop-blur flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold tracking-tight">
                            {formData.vpoNumber ? formData.vpoNumber : 'Order Details'}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {isLoading
                                ? (processingStep || "Processing...")
                                : (data
                                    ? <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-amber-500" /> AI extracted — review & edit below</span>
                                    : "Upload a PDF to get started"
                                )
                            }
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={!data && formData.items.length === 0}>
                                <Save className="h-4 w-4 mr-2" />
                                Save / Export
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleSaveJson}>
                                <Download className="h-4 w-4 mr-2" />
                                Save as JSON
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDownloadExcel}>
                                <FileSpreadsheet className="h-4 w-4 mr-2" />
                                Export to Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleDownloadPdf}>
                                <FileText className="h-4 w-4 mr-2" />
                                Export to PDF
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Removed Preview & PDF button as requested */}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-6">
                    {/* Error Display */}
                    {error && (
                        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-destructive">Error</p>
                                <p className="text-destructive/80 mt-1">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Raw Text Toggle */}
                    {rawText && (
                        <div className="border rounded-lg overflow-hidden">
                            <button
                                onClick={() => setShowRawText(!showRawText)}
                                className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
                            >
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">RAW</Badge>
                                    <span>Extracted Text ({rawText.split('\n').filter(Boolean).length} lines)</span>
                                </div>
                                {showRawText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            {showRawText && (
                                <pre className="p-4 text-xs text-muted-foreground bg-muted/10 max-h-60 overflow-auto whitespace-pre-wrap font-mono border-t">
                                    {rawText}
                                </pre>
                            )}
                        </div>
                    )}

                    {/* Order Header */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Order Information</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">VPO Number</Label>
                                <Input
                                    value={formData.vpoNumber || ''}
                                    onChange={(e) => updateField('vpoNumber', e.target.value)}
                                    placeholder="VPO-XXXXXXX"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Order Date</Label>
                                <Input
                                    value={formData.orderDate || ''}
                                    onChange={(e) => updateField('orderDate', e.target.value)}
                                    placeholder="MM/DD/YYYY"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">SO Reference</Label>
                                <Input
                                    value={formData.soReference || ''}
                                    onChange={(e) => updateField('soReference', e.target.value)}
                                    placeholder="SO-XXXXXXX"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Exp Ship Date</Label>
                                <Input
                                    value={formData.expShipDate || ''}
                                    onChange={(e) => updateField('expShipDate', e.target.value)}
                                    placeholder="MM/DD/YYYY"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">R Whs Date</Label>
                                <Input
                                    value={formData.cancelDate || ''}
                                    onChange={(e) => updateField('cancelDate', e.target.value)}
                                    placeholder="MM/DD/YYYY"
                                    className="h-9"
                                />
                            </div>
                            {/* Removed Agent field */}
                        </div>
                    </div>

                    <Separator />

                    {/* Customer & Supplier */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Buyer / Customer Section */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Buyer (Bill To)</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Select Buyer</Label>
                                    <Select
                                        value={formData.customerName === BUYER_OPTIONS.HK.name ? "HK" : "NY"}
                                        onValueChange={(val) => {
                                            const selected = val === "HK" ? BUYER_OPTIONS.HK : BUYER_OPTIONS.NY;
                                            setFormData(prev => ({
                                                ...prev,
                                                customerName: selected.name,
                                                customerAddress: selected.address
                                            }));
                                        }}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select Buyer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="NY">Mijenro International LLC (NY)</SelectItem>
                                            <SelectItem value="HK">Mijenro Hongkong Ltd (HK)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Address (Auto-filled)</Label>
                                    <Textarea
                                        value={formData.customerAddress || ''}
                                        readOnly
                                        className="min-h-[60px] text-xs bg-muted/50"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Supplier (Factory)</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Factory Name</Label>
                                    <Input
                                        value={formData.supplierName || ''}
                                        onChange={(e) => updateField('supplierName', e.target.value)}
                                        placeholder="Supplier name"
                                        className="h-9"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Address</Label>
                                    <Input
                                        value={formData.supplierAddress || ''}
                                        onChange={(e) => updateField('supplierAddress', e.target.value)}
                                        placeholder="Supplier address"
                                        className="h-9"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Shipping & Terms */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Shipping & Terms</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Ship To</Label>
                                <Input
                                    value={formData.shipTo || ''}
                                    onChange={(e) => updateField('shipTo', e.target.value)}
                                    placeholder="Ship-to address"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Ship Via</Label>
                                <Input
                                    value={formData.shipVia || ''}
                                    onChange={(e) => updateField('shipVia', e.target.value)}
                                    placeholder="e.g. Ocean Frt"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Shipment Terms</Label>
                                <Input
                                    value={formData.shipmentTerms || ''}
                                    onChange={(e) => updateField('shipmentTerms', e.target.value)}
                                    placeholder="e.g. FOB"
                                    className="h-9"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Payment Terms</Label>
                                <Select
                                    value={formData.paymentTerms || ''}
                                    onValueChange={(val) => updateField('paymentTerms', val)}
                                >
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select Terms" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_TERMS.map(term => (
                                            <SelectItem key={term} value={term}>{term}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Order Items */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Line Items
                                </h3>
                                {formData.items.length > 0 && (
                                    <Badge variant="secondary" className="text-xs">
                                        {formData.items.length} items · {totalQty} pcs · ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </Badge>
                                )}
                            </div>
                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addItem}>
                                <Plus className="h-3 w-3 mr-1" />
                                Add Item
                            </Button>
                        </div>

                        {formData.items.length === 0 ? (
                            <div className="border-2 border-dashed rounded-lg p-8 text-center">
                                <p className="text-sm text-muted-foreground mb-3">No items yet.</p>
                                <Button variant="outline" size="sm" onClick={addItem}>
                                    <Plus className="h-3 w-3 mr-1" />
                                    Add Item
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {formData.items.map((item, idx) => (
                                    <div key={idx} className="border rounded-lg overflow-hidden">
                                        {/* Item Header Row */}
                                        <div className="grid grid-cols-[1fr_1.5fr_80px_80px_100px_36px] gap-2 p-3 bg-muted/20 items-center text-sm">
                                            <Input
                                                className="h-8 text-xs font-mono"
                                                placeholder="Product Code"
                                                value={item.productCode}
                                                onChange={(e) => updateItem(idx, 'productCode', e.target.value)}
                                            />
                                            <Input
                                                className="h-8 text-xs"
                                                placeholder="Description"
                                                value={item.description}
                                                onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                            />
                                            <Input
                                                type="number"
                                                className="h-8 text-xs text-right"
                                                placeholder="Qty"
                                                value={item.totalQty || ''}
                                                onChange={(e) => updateItem(idx, 'totalQty', Number(e.target.value))}
                                            />
                                            <Input
                                                type="number"
                                                step="0.01"
                                                className="h-8 text-xs text-right"
                                                placeholder="Price"
                                                value={item.unitPrice || ''}
                                                onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                                            />
                                            <div className="text-xs text-right font-medium pr-1">
                                                ${(item.extension || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </div>
                                            <div className="flex gap-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground"
                                                    onClick={() => toggleItemExpand(idx)}
                                                >
                                                    {expandedItems.has(idx) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Item Details (expandable) */}
                                        {expandedItems.has(idx) && (
                                            <div className="p-3 border-t bg-background space-y-3">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">Color</Label>
                                                        <Input className="h-7 text-xs" value={item.color || ''} onChange={(e) => updateItem(idx, 'color', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">Collection</Label>
                                                        <Input className="h-7 text-xs" value={item.collection || ''} onChange={(e) => updateItem(idx, 'collection', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">Class</Label>
                                                        <Input className="h-7 text-xs" value={item.productClass || ''} onChange={(e) => updateItem(idx, 'productClass', e.target.value)} />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-xs text-muted-foreground">Material</Label>
                                                        <Input className="h-7 text-xs" value={item.material || ''} onChange={(e) => updateItem(idx, 'material', e.target.value)} />
                                                    </div>
                                                </div>

                                                {/* Size Breakdown */}
                                                {item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0 && (
                                                    <div className="space-y-1.5">
                                                        <Label className="text-xs text-muted-foreground">Size Breakdown</Label>
                                                        <div className="flex flex-wrap gap-2">
                                                            {Object.entries(item.sizeBreakdown).map(([size, qty]) => (
                                                                <div key={size} className="flex items-center gap-1 bg-muted/40 rounded px-2 py-1 text-xs">
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
                                                        Remove Item
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* Totals */}
                                <div className="flex justify-end gap-6 p-3 bg-muted/20 rounded-lg text-sm">
                                    <div>
                                        <span className="text-muted-foreground">Total Qty:</span>{' '}
                                        <span className="font-semibold">{totalQty.toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">Total:</span>{' '}
                                        <span className="font-semibold">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer Notes */}
                <div className="mt-4 bg-muted/10 p-4 rounded-lg border space-y-3">
                    <h3 className="font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Customer Notes
                    </h3>
                    <Textarea
                        placeholder="Enter notes here (will appear on a separate page in PDF)..."
                        value={formData.customerNotes || ''}
                        onChange={(e) => updateField('customerNotes', e.target.value)}
                        className="min-h-[100px]"
                    />
                </div>
            </div>

            <PoPreviewDialog
                open={isPoPreviewOpen}
                onOpenChange={setIsPoPreviewOpen}
                data={formData}
            />
        </div>
    );
}
