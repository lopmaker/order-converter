import { ExtractedOrderData } from '@/lib/parser';

/**
 * Returns supplier initials for use in filenames.
 */
function getSupplierInitials(name?: string): string {
    if (!name) return 'XX';
    const lower = name.toLowerCase();
    if (lower.includes('kanglong')) return 'KL';
    if (lower.includes('yixinya')) return 'YXY';
    if (lower.includes('junheng')) return 'JH';
    return (
        name.split(' ').map((word) => word[0]).join('').toUpperCase().substring(0, 3) || 'XX'
    );
}

function getSafeFilename(vpoNumber?: string, supplierName?: string, ext = 'xlsx'): string {
    const safeVpo = (vpoNumber || 'draft').replace(/[^a-z0-9-_]/gi, '_');
    const initials = getSupplierInitials(supplierName);
    return `VENDOR-PO-${safeVpo}-${initials}.${ext}`;
}

function getExportUnitPrice(item: ExtractedOrderData['items'][number]): number | null {
    return item.vendorUnitPrice ? Number(item.vendorUnitPrice) : null;
}

function getExportLineTotal(item: ExtractedOrderData['items'][number]): number | null {
    const unitPrice = getExportUnitPrice(item);
    if (unitPrice === null) return null;
    return unitPrice * Number(item.totalQty || 0);
}

/**
 * Export the vendor PO as an Excel file using the same format as the order extraction page.
 * Produces identically-named and formatted files regardless of where it's called from.
 */
export async function exportVendorExcel(data: ExtractedOrderData): Promise<void> {
    const Workbook = (await import('exceljs')).default.Workbook;
    const { saveAs } = await import('file-saver');

    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Vendor PO');

    worksheet.columns = [
        { header: '', key: 'A', width: 22 },
        { header: '', key: 'B', width: 45 },
        { header: '', key: 'C', width: 15 },
        { header: '', key: 'D', width: 35 },
        { header: '', key: 'E', width: 10 },
        { header: '', key: 'F', width: 12 },
        { header: '', key: 'G', width: 15 },
    ];

    const boldFont = { bold: true };
    const borderBottom = { bottom: { style: 'thin' } } as const;
    const borderThickBottom = { bottom: { style: 'thick' } } as const;
    const alignRight = { horizontal: 'right' } as const;
    const alignCenter = { horizontal: 'center' } as const;
    const wrapText = { wrapText: true, vertical: 'top' } as const;

    // Title
    worksheet.mergeCells('A1:G1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'VENDOR PURCHASE ORDER';
    titleCell.font = { size: 20, bold: true };
    titleCell.alignment = alignCenter;
    worksheet.addRow([]);

    // Header Info
    worksheet.mergeCells('A3:B3');
    worksheet.getCell('A3').value = `PO #: ${data.vpoNumber || 'DRAFT'}`;
    worksheet.getCell('A3').font = { size: 12, bold: true };

    worksheet.mergeCells('E3:G3');
    worksheet.getCell('E3').value = `Date: ${data.orderDate || ''}`;
    worksheet.getCell('E3').alignment = alignRight;

    worksheet.mergeCells('A4:D4');
    worksheet.getCell('A4').value = `Customer: ${data.customerName || ''}`;
    worksheet.getCell('A4').alignment = wrapText;

    worksheet.mergeCells('A5:D5');
    worksheet.getCell('A5').value = `To: ${data.supplierName || ''}`;
    worksheet.getCell('A5').alignment = wrapText;

    // Ship info row
    const shipRow = worksheet.addRow([]);
    shipRow.number; // skip row 6

    const row7 = worksheet.addRow([
        '', `Ship Via: ${data.shipVia || ''}`, '', `Terms: ${data.shipmentTerms || ''}`,
        '', '', `Payment: ${data.paymentTerms || ''}`,
    ]);
    row7.font = { size: 9, italic: true };
    worksheet.addRow([]);

    // Table Header
    let firstItemRowNumber = -1;
    let lastItemRowNumber = -1;

    const headerRow = worksheet.addRow([
        'Product Code', 'Description', 'Color', 'Material', 'Qty', 'Unit Price', 'Total',
    ]);
    headerRow.font = boldFont;
    headerRow.eachCell((cell) => {
        cell.border = { ...borderThickBottom };
        cell.alignment = { horizontal: 'left' };
    });
    headerRow.getCell(5).alignment = alignCenter;
    headerRow.getCell(6).alignment = alignRight;
    headerRow.getCell(7).alignment = alignRight;

    // Items
    data.items.forEach((item) => {
        const lineUnitPrice = getExportUnitPrice(item);
        const lineTotal = getExportLineTotal(item);
        const row = worksheet.addRow([
            item.productCode,
            item.description,
            item.color,
            item.material,
            item.totalQty,
            lineUnitPrice !== null ? lineUnitPrice : '',
            lineTotal !== null ? lineTotal : '',
        ]);

        if (firstItemRowNumber === -1) firstItemRowNumber = row.number;
        lastItemRowNumber = row.number;

        if (lineUnitPrice !== null && lineTotal !== null) {
            row.getCell(7).value = {
                formula: `E${row.number}*F${row.number}`,
                result: lineTotal,
            };
        } else {
            row.getCell(7).value = '';
        }

        row.getCell(2).alignment = wrapText;
        row.getCell(4).alignment = wrapText;
        row.getCell(5).alignment = alignCenter;
        row.getCell(6).numFmt = '"$"#,##0.00';
        row.getCell(7).numFmt = '"$"#,##0.00';

        if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
            const sizes = Object.entries(item.sizeBreakdown)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            const sizeRow = worksheet.addRow(['', `Sizes: ${sizes}`]);
            sizeRow.font = { italic: true, size: 9, color: { argb: 'FF555555' } };
            worksheet.mergeCells(`B${sizeRow.number}:G${sizeRow.number}`);
            sizeRow.getCell(2).alignment = wrapText;
        }
    });

    // Totals
    worksheet.addRow([]);
    const totalQty = data.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
    const totalAmount = data.items.reduce(
        (sum, item) => sum + (getExportLineTotal(item) || 0),
        0
    );

    const totalRow = worksheet.addRow(['', '', '', 'TOTAL', totalQty, '', totalAmount]);

    if (firstItemRowNumber !== -1 && lastItemRowNumber !== -1) {
        totalRow.getCell(5).value = {
            formula: `SUM(E${firstItemRowNumber}:E${lastItemRowNumber})`,
            result: totalQty,
        };
        totalRow.getCell(7).value = {
            formula: `SUM(G${firstItemRowNumber}:G${lastItemRowNumber})`,
            result: totalAmount,
        };
    }
    totalRow.font = boldFont;
    totalRow.getCell(4).alignment = alignRight;
    totalRow.getCell(5).alignment = alignCenter;
    totalRow.getCell(7).numFmt = '"$"#,##0.00';

    ['D', 'E', 'F', 'G'].forEach((col) => {
        totalRow.getCell(col).border = { top: { style: 'thin' } };
    });

    // Legal Lines
    worksheet.addRow([]);
    const legalRow = worksheet.addRow([
        '',
        "Terms & Conditions: 1. Acceptance of this Purchase Order (PO) constitutes a binding contract subject to Buyer's standard terms. 2. Time is of the essence; Buyer reserves the right to cancel or apply penalties for late deliveries. 3. Goods must strictly conform to specifications, quality standards, and all applicable safety laws. 4. Buyer reserves the right to inspect and reject non-conforming goods at Seller's expense. 5. Seller shall indemnify and hold Buyer harmless against all claims, including third-party intellectual property claims. 6. Payment terms begin upon receipt of a correct invoice and conforming goods. 7. WARNING- To ensure compliance with U.S. and other laws, all products supplied to or on behalf of buyer anywhere in the world must not include any labor, materials or components originating from, or produced in, Uzbekistan, Turkmenistan, Or China XUAR Xinjiang Province, or otherwise involving any party on a U.S. government's XUAR-related entities list. Products will be randomly tested for component origin. Non-compliance will result in the immediate cancellation of orders and a penalty equal to no less than two times the contracted value of the products.",
    ]);
    legalRow.font = { size: 9, italic: true, color: { argb: 'FF666666' } };
    worksheet.mergeCells(`B${legalRow.number}:G${legalRow.number}`);
    legalRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    legalRow.height = 120;

    // Generate file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    saveAs(blob, getSafeFilename(data.vpoNumber, data.supplierName, 'xlsx'));
}

/**
 * Export the vendor PO as a PDF file using the same format as the order extraction page.
 */
export async function exportVendorPdf(data: ExtractedOrderData): Promise<void> {
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('VENDOR PURCHASE ORDER', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

    // Header Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`PO #: ${data.vpoNumber || 'DRAFT'}`, 14, 35);
    doc.text(`Date: ${data.orderDate || ''}`, 196, 35, { align: 'right' });

    if (data.customerName) doc.text(`Customer: ${data.customerName}`, 14, 42);
    if (data.supplierName) doc.text(`To: ${data.supplierName}`, 14, 49);

    let startY = 56;
    if (data.shipVia || data.shipmentTerms || data.paymentTerms) {
        doc.setFontSize(8);
        const terms = [
            data.shipVia ? `Ship Via: ${data.shipVia}` : '',
            data.shipmentTerms ? `Terms: ${data.shipmentTerms}` : '',
            data.paymentTerms ? `Payment: ${data.paymentTerms}` : '',
        ].filter(Boolean).join('  |  ');
        doc.text(terms, 14, startY);
        startY += 8;
    }

    // Items Table
    type PdfTableCell = string | number | { content: string | number; colSpan?: number; styles?: { fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic'; textColor?: [number, number, number]; halign?: 'left' | 'center' | 'right' } };
    const tableRows: PdfTableCell[][] = [];

    data.items.forEach((item) => {
        const lineUnitPrice = getExportUnitPrice(item);
        const lineTotal = getExportLineTotal(item);
        tableRows.push([
            item.productCode || '',
            item.description || '',
            item.color || '',
            item.material || '',
            item.totalQty,
            lineUnitPrice !== null ? `$${lineUnitPrice.toFixed(2)}` : '',
            lineTotal !== null ? `$${lineTotal.toFixed(2)}` : '',
        ]);

        if (item.sizeBreakdown && Object.keys(item.sizeBreakdown).length > 0) {
            const sizes = Object.entries(item.sizeBreakdown)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ');
            tableRows.push([{
                content: `Sizes: ${sizes}`,
                colSpan: 7,
                styles: { fontStyle: 'italic', textColor: [100, 100, 100] },
            }]);
        }
    });

    // Totals Row
    const totalQty = data.items.reduce((sum, item) => sum + (item.totalQty || 0), 0);
    const totalAmount = data.items.reduce(
        (sum, item) => sum + (getExportLineTotal(item) || 0),
        0
    );

    tableRows.push([
        { content: '', colSpan: 3 } as PdfTableCell,
        { content: 'TOTAL', styles: { fontStyle: 'bold', halign: 'right' } },
        { content: totalQty, styles: { halign: 'center', fontStyle: 'bold' } },
        '',
        { content: `$${totalAmount.toFixed(2)}`, styles: { fontStyle: 'bold', halign: 'right' } },
    ]);

    autoTable(doc, {
        startY,
        head: [['Product Code', 'Description', 'Color', 'Material', 'Qty', 'Unit Price', 'Total']],
        body: tableRows,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 25 },
            4: { halign: 'center', cellWidth: 12 },
            5: { halign: 'right', cellWidth: 18 },
            6: { halign: 'right', cellWidth: 20 },
        },
        margin: { left: 14, right: 14 },
    });

    // Legal footer
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(6);
    doc.setTextColor(150, 150, 150);
    doc.text(
        "Terms & Conditions apply. See full PO document for details.",
        14,
        pageHeight - 10,
    );

    const { saveAs } = await import('file-saver');
    const pdfBlob = doc.output('blob');
    saveAs(pdfBlob, getSafeFilename(data.vpoNumber, data.supplierName, 'pdf'));
}
