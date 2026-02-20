'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExtractedOrderData } from '@/lib/parser';
import { Download, Printer, FileSpreadsheet } from 'lucide-react';

interface PoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractedOrderData;
}

import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

export function PoPreviewDialog({ open, onOpenChange, data }: PoPreviewDialogProps) {
  const total = data.items.reduce((acc, item) => acc + (item.extension || 0), 0);
  const totalQty = data.items.reduce((acc, item) => acc + (item.totalQty || 0), 0);
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const getExportUnitPrice = (item: ExtractedOrderData['items'][number]) => {
    return item.vendorUnitPrice ? Number(item.vendorUnitPrice) : null;
  };

  const getExportLineTotal = (item: ExtractedOrderData['items'][number]) => {
    const unitPrice = getExportUnitPrice(item);
    if (unitPrice === null) return null;
    return unitPrice * Number(item.totalQty || 0);
  };

  const getSupplierInitials = (name?: string) => {
    if (!name) return 'XX';
    const lower = name.toLowerCase();
    if (lower.includes('kanglong')) return 'KL';
    if (lower.includes('yixinya')) return 'YXY';
    if (lower.includes('junheng')) return 'JH';
    return (
      name.split(' ').map((word) => word[0]).join('').toUpperCase().substring(0, 3) || 'XX'
    );
  };

  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);
    try {
      const Workbook = (await import('exceljs')).default.Workbook;
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

      worksheet.mergeCells('A1:G1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'VENDOR PURCHASE ORDER';
      titleCell.font = { size: 20, bold: true };
      titleCell.alignment = alignCenter;
      worksheet.addRow([]);

      worksheet.mergeCells('A3:B3');
      worksheet.getCell('A3').value = `PO #: ${data.vpoNumber || 'DRAFT'}`;
      worksheet.getCell('A3').font = { size: 12, bold: true };

      worksheet.mergeCells('E3:G3');
      worksheet.getCell('E3').value = `Date: ${data.orderDate || ''}`;
      worksheet.getCell('E3').alignment = alignRight;

      worksheet.mergeCells('A4:D4');
      worksheet.getCell('A4').value = `Customer: ${data.customerName || ''}`;
      worksheet.getCell('A4').alignment = wrapText;

      worksheet.mergeCells('E4:G4');
      worksheet.getCell('E4').value = `Ship Date: ${data.expShipDate || ''}`;
      worksheet.getCell('E4').alignment = alignRight;

      worksheet.mergeCells('A5:D6');
      worksheet.getCell('A5').value = `Address: ${data.customerAddress || ''}`;
      worksheet.getCell('A5').alignment = wrapText;

      worksheet.mergeCells('E5:G5');
      worksheet.getCell('E5').value = `R Whs Date: ${data.cancelDate || ''}`;
      worksheet.getCell('E5').alignment = alignRight;

      worksheet.mergeCells('E6:G6');
      worksheet.getCell('E6').value = `Ref: ${data.soReference || ''}`;
      worksheet.getCell('E6').alignment = alignRight;

      worksheet.addRow([]);

      const sectionRowIdx = 8;
      const sectionRow = worksheet.getRow(sectionRowIdx);
      sectionRow.values = ['SUPPLIER', '', '', '', 'SHIP TO'];
      sectionRow.font = boldFont;

      worksheet.mergeCells(`A${sectionRowIdx}:C${sectionRowIdx}`);
      worksheet.getCell(`A${sectionRowIdx}`).border = borderBottom;

      worksheet.mergeCells(`E${sectionRowIdx}:G${sectionRowIdx}`);
      worksheet.getCell(`E${sectionRowIdx}`).border = borderBottom;

      const addrRowIdx = 9;
      const supplierText = [data.supplierName, data.supplierAddress]
        .filter(Boolean)
        .join('\n');
      const shipToText = data.shipTo || '';

      const maxLines = Math.max(supplierText.split('\n').length, shipToText.split('\n').length);
      worksheet.getRow(addrRowIdx).height = maxLines * 15;

      worksheet.mergeCells(`A${addrRowIdx}:C${addrRowIdx}`);
      worksheet.getCell(`A${addrRowIdx}`).value = supplierText;
      worksheet.getCell(`A${addrRowIdx}`).alignment = wrapText;

      worksheet.mergeCells(`E${addrRowIdx}:G${addrRowIdx}`);
      worksheet.getCell(`E${addrRowIdx}`).value = shipToText;
      worksheet.getCell(`E${addrRowIdx}`).alignment = wrapText;

      worksheet.addRow([]);
      worksheet.addRow([]);

      const itemHeaderRow = worksheet.addRow([
        'Product Code',
        'Description',
        'Color',
        'Material',
        'Qty',
        'Unit Price',
        'Total',
      ]);
      itemHeaderRow.font = boldFont;
      itemHeaderRow.eachCell((c) => {
        c.border = borderThickBottom;
      });

      let exportTotalQty = 0;
      let exportTotalAmount = 0;

      data.items.forEach((item) => {
        const lineUnitPrice = getExportUnitPrice(item);
        const lineTotal = getExportLineTotal(item);
        exportTotalQty += Number(item.totalQty || 0);
        exportTotalAmount += lineTotal || 0;

        const row = worksheet.addRow([
          item.productCode,
          item.description,
          item.color,
          item.material,
          item.totalQty,
          lineUnitPrice !== null ? lineUnitPrice : '',
          lineTotal !== null ? lineTotal : '',
        ]);
        row.getCell('E').numFmt = '#,##0';
        row.getCell('F').numFmt = '"$"#,##0.00';
        row.getCell('G').numFmt = '"$"#,##0.00';
        row.getCell('B').alignment = wrapText;
        row.getCell('D').alignment = wrapText;

        const linesDesc = Math.ceil((item.description?.length || 1) / 35);
        const linesMat = Math.ceil((item.material?.length || 1) / 30);
        row.height = Math.max(1, linesDesc, linesMat) * 15;
      });

      worksheet.addRow([]);
      const totalRow = worksheet.addRow(['', '', '', 'TOTAL', exportTotalQty, '', exportTotalAmount]);
      totalRow.font = boldFont;
      totalRow.getCell('E').numFmt = '#,##0';
      totalRow.getCell('G').numFmt = '"$"#,##0.00';
      totalRow.eachCell((c, colNumber) => {
        if (colNumber >= 4) c.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
      });

      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow(['Terms & Conditions']);
      worksheet.getRow(worksheet.rowCount).font = boldFont;
      worksheet.addRow([
        `Payment: ${data.paymentTerms || 'Net 30'}. Please include PO number on all invoices.`,
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const { saveAs } = await import('file-saver');
      const safeVpo = (data.vpoNumber || 'draft').replace(/[^a-z0-9-_]/gi, '_');
      const supplierInitials = getSupplierInitials(data.supplierName);
      saveAs(blob, `VENDOR-PO-${safeVpo}-${supplierInitials}.xlsx`);
    } catch (error) {
      console.error('Excel Export failed', error);
      alert('Failed to export Excel.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!printRef.current) return;

    setIsDownloading(true);
    try {
      const element = printRef.current;
      // Use html-to-image to avoid browser freeze and rendering issues
      const dataUrl = await toPng(element, {
        quality: 0.95,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      const pageHeight = pdf.internal.pageSize.getHeight();

      let heightLeft = pdfHeight;
      let position = 0;

      // First page
      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      // Subsequent pages
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`PO-${data.vpoNumber || 'draft'}.pdf`);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert("PDF generation failed. Please try the 'Print' button instead.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Purchase Order Preview</DialogTitle>
          <DialogDescription>Review the generated PO before sending to vendor.</DialogDescription>
        </DialogHeader>

        <div
          ref={printRef}
          className="border p-8 bg-white text-black shadow-sm my-4 text-sm print:border-0 print:shadow-none"
        >
          {/* PO Header */}
          <div className="flex justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold mb-2">PURCHASE ORDER</h1>
              <p className="text-gray-500">{data.customerName || 'Company Name'}</p>
              <p className="text-gray-500">{data.customerAddress || ''}</p>
            </div>
            <div className="text-right">
              <p className="font-bold">PO #: {data.vpoNumber || 'DRAFT'}</p>
              <p>Date: {data.orderDate || new Date().toLocaleDateString()}</p>
              {data.expShipDate && <p>Ship Date: {data.expShipDate}</p>}
              {data.cancelDate && <p>R Whs Date: {data.cancelDate}</p>}
              {data.soReference && (
                <p className="text-gray-500 text-xs mt-1">Ref: {data.soReference}</p>
              )}
            </div>
          </div>

          {/* Vendor & Ship To */}
          <div className="flex justify-between mb-8 gap-8">
            <div className="w-1/2">
              <h3 className="font-bold border-b mb-2">SUPPLIER</h3>
              <p>{data.supplierName || 'Supplier'}</p>
              <p className="text-gray-600 text-xs">{data.supplierAddress || ''}</p>
            </div>
            <div className="w-1/2">
              <h3 className="font-bold border-b mb-2">SHIP TO</h3>
              <p className="text-gray-600 text-xs">{data.shipTo || ''}</p>
            </div>
          </div>

          {/* Terms */}
          <div className="flex gap-6 mb-6 text-xs">
            {data.shipVia && (
              <div>
                <span className="font-bold">Ship Via:</span> {data.shipVia}
              </div>
            )}
            {data.shipmentTerms && (
              <div>
                <span className="font-bold">Terms:</span> {data.shipmentTerms}
              </div>
            )}
            {data.paymentTerms && (
              <div>
                <span className="font-bold">Payment:</span> {data.paymentTerms}
              </div>
            )}
            {data.agent && (
              <div>
                <span className="font-bold">Agent:</span> {data.agent}
              </div>
            )}
          </div>

          {/* Items Table */}
          <table className="w-full mb-8">
            <thead className="border-b-2 border-black">
              <tr className="text-left">
                <th className="py-2">Product Code / Description</th>
                <th className="py-2 w-16 text-center">Qty</th>
                <th className="py-2 w-24 text-right">Unit Price</th>
                <th className="py-2 w-24 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.length > 0 ? (
                data.items.map((item, idx) => (
                  <tr key={idx} style={{ breakInside: 'avoid' }}>
                    <td className="py-2">
                      <div className="font-bold font-mono text-xs">{item.productCode}</div>
                      <div className="text-gray-600 truncate max-w-sm text-xs">
                        {item.description}
                      </div>
                      {item.color && <div className="text-gray-400 text-xs">{item.color}</div>}
                    </td>
                    <td className="py-2 text-center">{item.totalQty}</td>
                    <td className="py-2 text-right">
                      {item.vendorUnitPrice ? `$${Number(item.vendorUnitPrice).toFixed(2)}` : ''}
                    </td>
                    <td className="py-2 text-right">
                      {item.vendorUnitPrice
                        ? `$${(Number(item.vendorUnitPrice) * Number(item.totalQty || 0)).toFixed(2)}`
                        : ''}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-gray-400 italic">
                    No items found
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black">
                <td className="py-2 font-bold">TOTAL</td>
                <td className="py-2 text-center font-bold">{totalQty.toLocaleString()}</td>
                <td className="py-2"></td>
                <td className="py-2 text-right font-bold">
                  ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div className="text-xs text-gray-500 mt-12 pt-4 border-t">
            <p>
              <strong>Terms & Conditions:</strong>{' '}
              {data.paymentTerms || 'Payment due within 30 days'}. Please include PO number on all
              invoices.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={handleDownloadExcel} disabled={isDownloadingExcel} variant="secondary">
            {isDownloadingExcel ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            {isDownloadingExcel ? 'Generating...' : 'Download Excel'}
          </Button>
          <Button onClick={handleDownloadPdf} disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {isDownloading ? 'Generating...' : 'Download PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
