'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { OrderFile } from '@/lib/types';
import toast from 'react-hot-toast';

interface OrdersContextType {
  orders: OrderFile[];
  activeOrderId: string | null;
  setActiveOrderId: (id: string | null) => void;
  addOrders: (files: File[]) => void;
  removeOrder: (id: string, e?: React.MouseEvent) => void;
  updateOrder: (id: string, updates: Partial<OrderFile>) => void;
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  // Session-only state: starts empty on fresh page load, persists during session
  const [orders, setOrders] = useState<OrderFile[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  // --- Queue Processing Logic ---
  useEffect(() => {
    const processQueue = async () => {
      // Find the first 'idle' order
      const nextOrder = orders.find((o) => o.status === 'idle');
      if (!nextOrder) return;

      const toastId = toast.loading(`Processing ${nextOrder.fileName}...`);

      // Mark as processing
      setOrders((prev) =>
        prev.map((o) =>
          o.id === nextOrder.id
            ? { ...o, status: 'processing', processingStep: 'Extracting text...' }
            : o
        )
      );

      if (!nextOrder.file) {
        // If file is missing (e.g. from local storage), we can't process it.
        // Mark as error.
        const errorMsg = 'File missing (reloaded?). Please re-upload.';
        toast.error(errorMsg, { id: toastId });
        setOrders((prev) =>
          prev.map((o) => (o.id === nextOrder.id ? { ...o, status: 'error', error: errorMsg } : o))
        );
        return;
      }

      try {
        // Step 0: Check File Size (Vercel limit 4.5MB)
        if (nextOrder.file.size > 4.5 * 1024 * 1024) {
          throw new Error(
            `File too large (${(nextOrder.file.size / 1024 / 1024).toFixed(2)}MB). Vercel limits uploads to 4.5MB.`
          );
        }

        // Step 1: Extract Text
        const formData = new FormData();
        formData.append('file', nextOrder.file);

        const pdfResponse = await fetch('/api/parse-pdf', { method: 'POST', body: formData });

        let pdfResult;
        if (!pdfResponse.ok) {
          const errorText = await pdfResponse.text();
          throw new Error(
            `PDF Extraction Failed (${pdfResponse.status}): ${errorText.slice(0, 100) || pdfResponse.statusText}`
          );
        }

        try {
          pdfResult = await pdfResponse.json();
        } catch (e: unknown) {
          throw new Error(`Invalid JSON from PDF Parser: ${getErrorMessage(e)}`);
        }

        if (!pdfResult.text?.trim()) {
          throw new Error(pdfResult.error || 'Failed to extract text');
        }

        const extractedText = pdfResult.text;

        // Update Step
        toast.loading('AI is analyzing...', { id: toastId });
        setOrders((prev) =>
          prev.map((o) => (o.id === nextOrder.id ? { ...o, processingStep: 'AI analyzing...' } : o))
        );

        // Step 2: AI Parsing
        const aiResponse = await fetch('/api/parse-with-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: extractedText }),
        });

        let aiResult;
        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          throw new Error(
            `AI Analysis Failed (${aiResponse.status}): ${errorText.slice(0, 100) || aiResponse.statusText}`
          );
        }

        try {
          aiResult = await aiResponse.json();
        } catch (e: unknown) {
          throw new Error(`Invalid JSON from AI: ${getErrorMessage(e)}`);
        }

        if (!aiResult.success) {
          throw new Error(aiResult.error || 'AI parsing failed');
        }

        // Success
        toast.success(`Successfully processed ${nextOrder.fileName}!`, { id: toastId });
        setOrders((prev) =>
          prev.map((o) =>
            o.id === nextOrder.id
              ? {
                  ...o,
                  status: 'completed',
                  data: aiResult.data,
                  originalText: extractedText,
                }
              : o
          )
        );
      } catch (error: unknown) {
        console.error('Processing error:', error);
        const errorMsg = getErrorMessage(error);
        toast.error(errorMsg, { id: toastId });
        setOrders((prev) =>
          prev.map((o) => (o.id === nextOrder.id ? { ...o, status: 'error', error: errorMsg } : o))
        );
      }
    };

    // If we have an idle order and NOT explicitly paused (logic can be added), process it.
    // We check if any order is currently 'processing' to do them sequentially
    const isAnyProcessing = orders.some((o) => o.status === 'processing');
    if (!isAnyProcessing) {
      processQueue();
    }
  }, [orders]);

  const addOrders = (files: File[]) => {
    const newOrders: OrderFile[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      fileName: file.name,
      fileSize: file.size,
      status: 'idle',
    }));

    setOrders((prev) => [...prev, ...newOrders]);
    // If no active order, select the first new one
    if (!activeOrderId && newOrders.length > 0) {
      setActiveOrderId(newOrders[0].id);
    }
  };

  const removeOrder = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setOrders((prev) => {
      const newOrders = prev.filter((o) => o.id !== id);
      // If we removed the active one, select the previous one or null
      if (activeOrderId === id) {
        setActiveOrderId(newOrders.length > 0 ? newOrders[0].id : null);
      }
      return newOrders;
    });
  };

  const updateOrder = (id: string, updates: Partial<OrderFile>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)));
  };

  return (
    <OrdersContext.Provider
      value={{
        orders,
        activeOrderId,
        setActiveOrderId,
        addOrders,
        removeOrder,
        updateOrder,
      }}
    >
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrdersContext);
  if (context === undefined) {
    throw new Error('useOrders must be used within an OrdersProvider');
  }
  return context;
}
