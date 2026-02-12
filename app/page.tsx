'use client';

import { useState, useRef, useCallback, useEffect } from "react";
import { PdfUploader } from "@/components/pdf-viewer/pdf-uploader";
import { OrderForm } from "@/components/order-form/order-form";
import { ExtractedOrderData } from "@/lib/parser";
import { FileList, OrderFile } from "@/components/sidebar/file-list";
import { FileText } from "lucide-react";

export default function Home() {
  const [orders, setOrders] = useState<OrderFile[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // Resizable panel state
  const [leftWidth, setLeftWidth] = useState(20); // Sidebar width percentage
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // --- Queue Processing Logic ---
  useEffect(() => {
    const processQueue = async () => {
      // Find the first 'idle' order
      const nextOrder = orders.find(o => o.status === 'idle');
      if (!nextOrder) return;

      // Mark as processing
      setOrders(prev => prev.map(o => o.id === nextOrder.id ? { ...o, status: 'processing', processingStep: 'Extracting text...' } : o));

      try {
        // Step 0: Check File Size (Vercel limit 4.5MB)
        if (nextOrder.file.size > 4.5 * 1024 * 1024) {
          throw new Error(`File too large (${(nextOrder.file.size / 1024 / 1024).toFixed(2)}MB). Vercel limits uploads to 4.5MB.`);
        }

        // Step 1: Extract Text
        const formData = new FormData();
        formData.append('file', nextOrder.file);

        const pdfResponse = await fetch('/api/parse-pdf', { method: 'POST', body: formData });

        let pdfResult;
        try {
          pdfResult = await pdfResponse.json();
        } catch (e) {
          const errorText = await pdfResponse.text();
          throw new Error(`PDF Extraction Failed (${pdfResponse.status}): ${errorText.slice(0, 100) || pdfResponse.statusText}`);
        }

        if (!pdfResponse.ok || !pdfResult.text?.trim()) {
          throw new Error(pdfResult.error || 'Failed to extract text');
        }

        const extractedText = pdfResult.text;

        // Update Step
        setOrders(prev => prev.map(o => o.id === nextOrder.id ? { ...o, processingStep: 'AI analyzing...' } : o));

        // Step 2: AI Parsing
        const aiResponse = await fetch('/api/parse-with-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: extractedText }),
        });

        let aiResult;
        try {
          aiResult = await aiResponse.json();
        } catch (e) {
          const errorText = await aiResponse.text();
          throw new Error(`AI Analysis Failed (${aiResponse.status}): ${errorText.slice(0, 100) || aiResponse.statusText}`);
        }

        if (!aiResponse.ok || !aiResult.success) {
          throw new Error(aiResult.error || 'AI parsing failed');
        }

        // Success
        setOrders(prev => prev.map(o => o.id === nextOrder.id ? {
          ...o,
          status: 'completed',
          data: aiResult.data,
          originalText: extractedText
        } : o));

      } catch (error: any) {
        console.error("Processing error:", error);
        setOrders(prev => prev.map(o => o.id === nextOrder.id ? {
          ...o,
          status: 'error',
          error: error.message || 'Unknown error'
        } : o));
      }
    };

    // If we have an idle order and NOT explicitly paused (logic can be added), process it.
    // We check if any order is currently 'processing' to do them sequentially
    const isAnyProcessing = orders.some(o => o.status === 'processing');
    if (!isAnyProcessing) {
      processQueue();
    }
  }, [orders]);

  // --- Handlers ---
  const handleFilesSelect = (files: File[]) => {
    const newOrders: OrderFile[] = files.map(file => ({
      id: crypto.randomUUID(),
      file,
      status: 'idle'
    }));

    setOrders(prev => [...prev, ...newOrders]);
    // If no active order, select the first new one
    if (!activeOrderId && newOrders.length > 0) {
      setActiveOrderId(newOrders[0].id);
    }
  };

  const handleRemoveOrder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrders(prev => {
      const newOrders = prev.filter(o => o.id !== id);
      // If we removed the active one, select the previous one or null
      if (activeOrderId === id) {
        setActiveOrderId(newOrders.length > 0 ? newOrders[0].id : null);
      }
      return newOrders;
    });
  };

  const activeOrder = orders.find(o => o.id === activeOrderId);

  // --- Resizer ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => { isDragging.current = true; e.preventDefault(); }, []);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.max(15, Math.min(40, newWidth))); // Limit sidebar width
    };
    const handleMouseUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, []);


  // --- Render ---
  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* App Header */}
      <header className="flex-none h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-6 justify-between z-50">
        <div className="flex items-center gap-2 font-semibold">
          <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
            <FileText className="h-5 w-5" />
          </div>
          <span>Order Converter AI</span>
        </div>
      </header>

      {/* Workspace */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">

        {/* Sidebar (File List) */}
        {orders.length > 0 && (
          <div style={{ width: `${leftWidth}%` }} className="h-full flex flex-col border-r bg-muted/10 relative shrink-0">
            <FileList
              orders={orders}
              activeOrderId={activeOrderId}
              onSelectOrder={setActiveOrderId}
              onRemoveOrder={handleRemoveOrder}
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

          {/* Case 1: No Orders (and no active ID) -> Large Uploader */}
          {orders.length === 0 && (
            <div className="flex-1 p-8 bg-muted/10">
              <PdfUploader onFilesSelect={handleFilesSelect} />
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
                    <span className="font-semibold truncate">{activeOrder.file.name}</span>
                  </div>
                  <iframe
                    src={URL.createObjectURL(activeOrder.file)}
                    className="w-full h-full border-0"
                    title="PDF Preview"
                  />
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
                <h2 className="text-2xl font-semibold">Your Orders</h2>
                <p className="text-muted-foreground">Select an order from the sidebar to edit, or upload more.</p>
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
