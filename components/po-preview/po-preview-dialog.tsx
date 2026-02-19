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
import { Download, Printer } from 'lucide-react';

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

  const handlePrint = () => {
    window.print();
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
                    <td className="py-2 text-right">${(item.unitPrice || 0).toFixed(2)}</td>
                    <td className="py-2 text-right">${(item.extension || 0).toFixed(2)}</td>
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

        <DialogFooter>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
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
