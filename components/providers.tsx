'use client';

import { OrdersProvider } from '@/components/orders-provider';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <OrdersProvider>
      {children}
      <Toaster position="bottom-right" toastOptions={{ duration: 5000 }} />
    </OrdersProvider>
  );
}
