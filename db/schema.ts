
import { pgTable, text, decimal, timestamp, integer, uuid } from 'drizzle-orm/pg-core';

// Orders Table
export const orders = pgTable('orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    vpoNumber: text('vpo_number').notNull(),
    customerName: text('customer_name'),
    customerAddress: text('customer_address'),
    supplierName: text('supplier_name'),
    supplierAddress: text('supplier_address'),
    orderDate: text('order_date'),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }),
    status: text('status').default('Confirmed'),

    // New Fields
    soReference: text('so_reference'),
    expShipDate: text('exp_ship_date'),
    cancelDate: text('cancel_date'),
    shipTo: text('ship_to'),
    shipVia: text('ship_via'),
    shipmentTerms: text('shipment_terms'),
    paymentTerms: text('payment_terms'),
    customerNotes: text('customer_notes'),
    workflowStatus: text('workflow_status').default('PO_UPLOADED'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    customerTermDays: integer('customer_term_days').default(30),
    vendorTermDays: integer('vendor_term_days').default(30),
    logisticsTermDays: integer('logistics_term_days').default(15),
    estimatedMargin: decimal('estimated_margin', { precision: 12, scale: 2 }),
    estimatedMarginRate: decimal('estimated_margin_rate', { precision: 7, scale: 4 }),

    createdAt: timestamp('created_at').defaultNow(),
});

// Order Items Table
export const orderItems = pgTable('order_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    productCode: text('product_code'),
    description: text('description'),
    quantity: integer('quantity'),
    unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
    customerUnitPrice: decimal('customer_unit_price', { precision: 10, scale: 2 }),
    vendorUnitPrice: decimal('vendor_unit_price', { precision: 10, scale: 2 }),
    total: decimal('total', { precision: 10, scale: 2 }),
    tariffRate: decimal('tariff_rate', { precision: 7, scale: 4 }),
    estimatedDutyCost: decimal('estimated_duty_cost', { precision: 12, scale: 2 }),
    estimated3plCost: decimal('estimated_3pl_cost', { precision: 12, scale: 2 }),
    estimatedMargin: decimal('estimated_margin', { precision: 12, scale: 2 }),

    // New Fields
    color: text('color'),
    material: text('material'),
    sizeBreakdown: text('size_breakdown'), // storing JSON as text
    productClass: text('product_class'),
    collection: text('collection'),

    createdAt: timestamp('created_at').defaultNow(),
});

export const tariffRates = pgTable('tariff_rates', {
    id: uuid('id').defaultRandom().primaryKey(),
    productClass: text('product_class').notNull().unique(),
    tariffRate: decimal('tariff_rate', { precision: 7, scale: 4 }).notNull().default('0'),
    source: text('source').notNull().default('manual'),
    notes: text('notes'),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
});

export const containers = pgTable('containers', {
    id: uuid('id').defaultRandom().primaryKey(),
    containerNo: text('container_no').notNull().unique(),
    vesselName: text('vessel_name'),
    status: text('status').default('PLANNED'),
    etd: timestamp('etd', { withTimezone: true }),
    atd: timestamp('atd', { withTimezone: true }),
    eta: timestamp('eta', { withTimezone: true }),
    ata: timestamp('ata', { withTimezone: true }),
    arrivalAtWarehouse: timestamp('arrival_at_warehouse', { withTimezone: true }),
    createdAt: timestamp('created_at').defaultNow(),
});

export const containerAllocations = pgTable('container_allocations', {
    id: uuid('id').defaultRandom().primaryKey(),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'cascade' }).notNull(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    allocatedQty: integer('allocated_qty'),
    allocatedAmount: decimal('allocated_amount', { precision: 12, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const shippingDocuments = pgTable('shipping_documents', {
    id: uuid('id').defaultRandom().primaryKey(),
    docNo: text('doc_no').notNull().unique(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'set null' }),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    status: text('status').default('DRAFT'),
    payload: text('payload'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const commercialInvoices = pgTable('commercial_invoices', {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNo: text('invoice_no').notNull().unique(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'set null' }),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    currency: text('currency').default('USD'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('OPEN'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const vendorBills = pgTable('vendor_bills', {
    id: uuid('id').defaultRandom().primaryKey(),
    billNo: text('bill_no').notNull().unique(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    currency: text('currency').default('USD'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('OPEN'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const logisticsBills = pgTable('logistics_bills', {
    id: uuid('id').defaultRandom().primaryKey(),
    billNo: text('bill_no').notNull().unique(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'set null' }),
    provider: text('provider'),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    currency: text('currency').default('USD'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('OPEN'),
    createdAt: timestamp('created_at').defaultNow(),
});

export const payments = pgTable('payments', {
    id: uuid('id').defaultRandom().primaryKey(),
    targetType: text('target_type').notNull(), // CUSTOMER_INVOICE | VENDOR_BILL | LOGISTICS_BILL
    targetId: uuid('target_id').notNull(),
    direction: text('direction').notNull(), // IN | OUT
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: timestamp('payment_date', { withTimezone: true }).defaultNow(),
    method: text('method'),
    referenceNo: text('reference_no'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
});
