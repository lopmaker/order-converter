import { pgTable, text, decimal, timestamp, integer, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Vendors Portfolio Table
export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(), // The company name used to link to supplierName
    address: text('address'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    nameIndex: uniqueIndex('vendor_name_idx').on(table.name),
  })
);

// Orders Table
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    vpoNumber: text('vpo_number').notNull(),
    customerName: text('customer_name'),
    customerAddress: text('customer_address'),
    supplierName: text('supplier_name'),
    supplierAddress: text('supplier_address'),
    orderDate: timestamp('order_date', { withTimezone: true }),
    totalAmount: decimal('total_amount', { precision: 10, scale: 2 }),
    status: text('status').default('Confirmed'),

    // New Fields
    soReference: text('so_reference'),
    expShipDate: timestamp('exp_ship_date', { withTimezone: true }),
    cancelDate: timestamp('cancel_date', { withTimezone: true }),
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
  },
  (orders) => ({
    vpoNumberIndex: index('vpo_number_idx').on(orders.vpoNumber),
    customerNameIndex: index('customer_name_idx').on(orders.customerName),
    statusIndex: index('status_idx').on(orders.status),
    workflowStatusIndex: index('workflow_status_idx').on(orders.workflowStatus),
  })
);

// Order Items Table
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
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
  },
  (orderItems) => ({
    orderIdIndex: index('order_id_idx').on(orderItems.orderId),
  })
);

export const tariffRates = pgTable(
  'tariff_rates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productClass: text('product_class').notNull().unique(),
    tariffRate: decimal('tariff_rate', { precision: 7, scale: 4 }).notNull().default('0'),
    source: text('source').notNull().default('manual'),
    notes: text('notes'),
    updatedAt: timestamp('updated_at').defaultNow(),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (tariffRates) => ({
    productClassIndex: index('product_class_idx').on(tariffRates.productClass),
  })
);

export const containers = pgTable(
  'containers',
  {
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
  },
  (containers) => ({
    containerNoIndex: index('container_no_idx').on(containers.containerNo),
  })
);

export const containerAllocations = pgTable(
  'container_allocations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    containerId: uuid('container_id')
      .references(() => containers.id, { onDelete: 'cascade' })
      .notNull(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    allocatedQty: integer('allocated_qty'),
    allocatedAmount: decimal('allocated_amount', { precision: 12, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (containerAllocations) => ({
    containerIdIndex: index('container_id_idx').on(containerAllocations.containerId),
    orderIdIndex: index('container_allocation_order_id_idx').on(containerAllocations.orderId),
    orderItemIdIndex: index('order_item_id_idx').on(containerAllocations.orderItemId),
  })
);

export const shippingDocuments = pgTable(
  'shipping_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    docNo: text('doc_no').notNull().unique(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'set null' }),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    status: text('status').default('DRAFT'),
    payload: text('payload'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (shippingDocuments) => ({
    docNoIndex: index('doc_no_idx').on(shippingDocuments.docNo),
    orderIdIndex: index('shipping_document_order_id_idx').on(shippingDocuments.orderId),
    containerIdIndex: index('shipping_document_container_id_idx').on(shippingDocuments.containerId),
  })
);

export const commercialInvoices = pgTable(
  'commercial_invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    invoiceNo: text('invoice_no').notNull().unique(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    containerId: uuid('container_id').references(() => containers.id, { onDelete: 'set null' }),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    currency: text('currency').default('USD'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('OPEN'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (commercialInvoices) => ({
    invoiceNoIndex: index('invoice_no_idx').on(commercialInvoices.invoiceNo),
    orderIdIndex: index('commercial_invoice_order_id_idx').on(commercialInvoices.orderId),
    containerIdIndex: index('commercial_invoice_container_id_idx').on(
      commercialInvoices.containerId
    ),
  })
);

export const vendorBills = pgTable(
  'vendor_bills',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    billNo: text('bill_no').notNull().unique(),
    orderId: uuid('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow(),
    dueDate: timestamp('due_date', { withTimezone: true }),
    currency: text('currency').default('USD'),
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('OPEN'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (vendorBills) => ({
    billNoIndex: index('bill_no_idx').on(vendorBills.billNo),
    orderIdIndex: index('vendor_bill_order_id_idx').on(vendorBills.orderId),
  })
);

export const logisticsBills = pgTable(
  'logistics_bills',
  {
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
  },
  (logisticsBills) => ({
    billNoIndex: index('logistics_bill_no_idx').on(logisticsBills.billNo),
    orderIdIndex: index('logistics_bill_order_id_idx').on(logisticsBills.orderId),
    containerIdIndex: index('logistics_bill_container_id_idx').on(logisticsBills.containerId),
  })
);

export const payments = pgTable(
  'payments',
  {
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
  },
  (payments) => ({
    targetIndex: index('target_idx').on(payments.targetType, payments.targetId),
  })
);
