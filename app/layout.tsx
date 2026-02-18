import type { Metadata } from "next";
import "./globals.css";
import { OrdersProvider } from "@/components/orders-provider";

export const metadata: Metadata = {
  title: "Order Converter AI",
  description: "Convert purchase order PDFs into editable structured orders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <OrdersProvider>
          {children}
        </OrdersProvider>
      </body>
    </html>
  );
}
