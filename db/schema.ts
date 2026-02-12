
import { pgTable, serial, text, decimal, timestamp, integer, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Orders Table
export const orders = pgTable('orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    vpoNumber: text('vpo_number').notNull(),
    customerName: text('customer_name'),
    supplierName: text('supplier_name'),
    orderDate: text('order_date'), // Keeping as text to match extraction format, can cast later
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }),
    status: text('status').default('Confirmed'),
    createdAt: timestamp('created_at').defaultNow(),
});

// Order Items Table
export const orderItems = pgTable('order_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').references(() => orders.id).notNull(),
    productCode: text('product_code'),
    description: text('description'),
    quantity: integer('quantity'),
    unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
    total: decimal('total', { precision: 10, scale: 2 }),
    createdAt: timestamp('created_at').defaultNow(),
});
