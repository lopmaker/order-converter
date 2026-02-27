'use client';

import Link from 'next/link';
import { useState, useRef, useCallback, useEffect } from 'react';
import { PdfUploader } from '@/components/pdf-viewer/pdf-uploader';
import { OrderForm } from '@/components/order-form/order-form';
import { FileList } from '@/components/sidebar/file-list';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useOrders } from '@/components/orders-provider';
import { useI18n } from '@/components/locale-provider';
import { FileText, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { t } = useI18n();
  const { orders, activeOrderId, setActiveOrderId, addOrders, removeOrder, updateOrder } =
    useOrders();

  // Resizable panel state
  const [leftWidth, setLeftWidth] = useState(20); // Sidebar width percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // --- Handlers ---
  const handleFilesSelect = (files: File[]) => {
    addOrders(files);
  };

  const handleRemoveOrderWrapper = (id: string, e: React.MouseEvent) => {
    removeOrder(id, e);
  };

  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // --- Resizer ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    e.preventDefault();
  }, []);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(15, Math.min(40, newWidth))); // Limit sidebar width
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* App Header */}
      <header className="flex-none h-12 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-5 justify-between z-50">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-sm tracking-tight">OrderAI</span>
        </div>
        <nav>
          <div className="flex items-center gap-1.5">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Link href="/dashboard">{t('HomePage.dashboardLink', 'Dashboard')} →</Link>
            </Button>
            <LanguageSwitcher />
          </div>
        </nav>
      </header>

      {/* Workspace */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* Sidebar (File List) */}
        {orders.length > 0 && (
          <div
            style={{ width: `${leftWidth}%` }}
            className="h-full flex flex-col border-r bg-muted/10 relative shrink-0"
          >
            <FileList
              orders={orders}
              activeOrderId={activeOrderId}
              onSelectOrder={setActiveOrderId}
              onRemoveOrder={handleRemoveOrderWrapper}
              onAddMore={() => setActiveOrderId(null)}
            />
            {/* Drag Handle */}
            <div
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/50 transition-colors z-50"
              onMouseDown={handleMouseDown}
            />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background relative">
          {/* Case 1: No Orders (and no active ID) -> Home Actions */}
          {orders.length === 0 && (
            <div className="flex-1 p-8 bg-muted/10 flex items-center justify-center">
              <div className="grid grid-cols-1 lg:grid-cols-2 max-w-5xl w-full gap-8">
                {/* PDF Uploader handles its own sizing within the grid cell */}
                <PdfUploader onFilesSelect={handleFilesSelect} />

                {/* Dashboard Link tiled directly next to it */}
                <div className="h-full w-full p-6 flex flex-col items-center justify-center">
                  <Link
                    href="/dashboard"
                    className="w-full max-w-md p-12 border-2 border-transparent rounded-xl bg-card shadow-sm hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 flex flex-col items-center justify-center text-center group min-h-[300px]"
                  >
                    <div className="h-16 w-16 mb-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                      <Activity className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold tracking-tight mb-2">
                      {t('HomePage.viewDashboard', 'View Sales Dashboard')}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      {t(
                        'HomePage.dashboardCardDescription',
                        'Access the central command center to manage active orders, logistics, and finances.'
                      )}
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Case 2: Active Order Selected */}
          {activeOrder && (
            <div className="flex flex-1 h-full">
              {/* Inner Split View for Active Order */}
              <div className="flex-1 flex h-full">
                {/* PDF Preview */}
                <div className="w-[40%] h-full flex flex-col border-r bg-muted/20">
                  <div className="p-2 border-b text-xs flex justify-between bg-background">
                    <span className="font-semibold truncate">
                      {activeOrder.fileName ||
                        activeOrder.file?.name ||
                        t('HomePage.unknownFile', 'Unknown File')}
                    </span>
                  </div>
                  {activeOrder.file ? (
                    <iframe
                      src={URL.createObjectURL(activeOrder.file)}
                      className="w-full h-full border-0"
                      title="PDF Preview"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center gap-3">
                      <p className="font-medium">
                        {t('HomePage.pdfPreviewUnavailable', 'PDF Preview Unavailable')}
                      </p>
                      <p className="text-xs">
                        {t('HomePage.fileNotPersisted', 'The file was not persisted after reload.')}
                      </p>
                      <label className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2">
                        {t('HomePage.reuploadPdf', 'Re-upload PDF')}
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && activeOrder) {
                              updateOrder(activeOrder.id, { file });
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Order Form */}
                <div className="flex-1 h-full overflow-hidden bg-background">
                  <OrderForm
                    key={activeOrder.id}
                    data={activeOrder.data}
                    isLoading={activeOrder.status === 'processing' || activeOrder.status === 'idle'}
                    processingStep={activeOrder.processingStep}
                    rawText={activeOrder.originalText}
                    error={activeOrder.error}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Case 3: Orders exist but user explicitly wants to add more (activeOrderId === null) */}
          {orders.length > 0 && !activeOrderId && (
            <div className="flex-1 p-8 bg-muted/10 flex flex-col items-center justify-center">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold">
                  {t('HomePage.yourOrders', 'Your Orders')}
                </h2>
                <p className="text-muted-foreground">
                  {t(
                    'HomePage.selectOrderHint',
                    'Select an order from the sidebar to edit, or upload more.'
                  )}
                </p>
              </div>
              <div className="w-full max-w-xl">
                <PdfUploader onFilesSelect={handleFilesSelect} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
