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
import { Download, Printer, FileSpreadsheet, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';

interface PoPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ExtractedOrderData;
  onDownloadExcel?: () => Promise<void>;
  onDownloadPdf?: () => Promise<void>;
}

export function PoPreviewDialog({
  open,
  onOpenChange,
  data,
  onDownloadExcel,
  onDownloadPdf,
}: PoPreviewDialogProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const total = data.items.reduce((acc, item) => acc + (item.extension || 0), 0);
  const totalQty = data.items.reduce((acc, item) => acc + (item.totalQty || 0), 0);

  const getExportUnitPrice = (item: ExtractedOrderData['items'][number]) => {
    return item.vendorUnitPrice ? Number(item.vendorUnitPrice) : null;
  };

  const getExportLineTotal = (item: ExtractedOrderData['items'][number]) => {
    const unitPrice = getExportUnitPrice(item);
    if (unitPrice === null) return null;
    return unitPrice * Number(item.totalQty || 0);
  };

  const exportTotalQty = data.items.reduce((s, i) => s + (i.totalQty || 0), 0);
  const exportTotalAmount = data.items.reduce((s, i) => s + (getExportLineTotal(i) || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = async () => {
    if (!onDownloadExcel) return;
    setIsDownloadingExcel(true);
    try {
      await onDownloadExcel();
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handlePdf = async () => {
    if (!onDownloadPdf) return;
    setIsDownloadingPdf(true);
    try {
      await onDownloadPdf();
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendor Purchase Order Preview</DialogTitle>
          <DialogDescription>Review the generated Vendor PO before sending.</DialogDescription>
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

          {/* Vendor Info */}
          {data.supplierName && (
            <div className="mb-6 p-3 bg-gray-50 rounded border">
              <p className="font-semibold">{data.supplierName}</p>
              {data.supplierAddress && (
                <p className="text-gray-600 text-xs">{data.supplierAddress}</p>
              )}
            </div>
          )}

          {/* Terms */}
          <div className="grid grid-cols-3 gap-4 mb-6 text-xs">
            {data.shipVia && (
              <div>
                <span className="text-gray-500">Ship Via:</span> {data.shipVia}
              </div>
            )}
            {data.shipmentTerms && (
              <div>
                <span className="text-gray-500">Terms:</span> {data.shipmentTerms}
              </div>
            )}
            {data.paymentTerms && (
              <div>
                <span className="text-gray-500">Payment:</span> {data.paymentTerms}
              </div>
            )}
          </div>

          {/* Items Table */}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-2 pr-2">Product Code</th>
                <th className="text-left py-2 pr-2">Description</th>
                <th className="text-left py-2 pr-2">Color</th>
                <th className="text-right py-2 pr-2">Qty</th>
                <th className="text-right py-2 pr-2">Unit Price</th>
                <th className="text-right py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item, idx) => {
                const lineUnitPrice = getExportUnitPrice(item);
                const lineTotal = getExportLineTotal(item);
                return (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-1.5 pr-2 font-mono text-xs">{item.productCode}</td>
                    <td className="py-1.5 pr-2">{item.description}</td>
                    <td className="py-1.5 pr-2">{item.color}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {(item.totalQty || 0).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {lineUnitPrice !== null ? `$${lineUnitPrice.toFixed(2)}` : ''}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {lineTotal !== null ? `$${lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-black font-bold">
                <td colSpan={3} className="py-2 text-right">
                  TOTAL
                </td>
                <td className="py-2 text-right tabular-nums">
                  {exportTotalQty.toLocaleString()}
                </td>
                <td></td>
                <td className="py-2 text-right tabular-nums">
                  ${exportTotalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 sm:gap-0 mt-4">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {onDownloadExcel && (
            <Button onClick={handleExcel} disabled={isDownloadingExcel} variant="secondary">
              {isDownloadingExcel ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              {isDownloadingExcel ? 'Generating...' : 'Download Excel'}
            </Button>
          )}
          {onDownloadPdf && (
            <Button onClick={handlePdf} disabled={isDownloadingPdf}>
              {isDownloadingPdf ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {isDownloadingPdf ? 'Generating...' : 'Download PDF'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
