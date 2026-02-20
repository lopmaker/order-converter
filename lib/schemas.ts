import { z } from 'zod';

// Utility schemas for shared scalar types
const DateString = z.string().or(z.date()).transform((val) => new Date(val));
const DecimalString = z.number().or(z.string()).transform((val) => Number(val));

// ==========================================
// Order Schemas
// ==========================================

export const orderItemSchema = z.object({
    id: z.string().uuid().optional(),
    productCode: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    quantity: z.number().int().nonnegative().optional().nullable(),
    unitPrice: DecimalString.optional().nullable(),
    customerUnitPrice: DecimalString.optional().nullable(),
    vendorUnitPrice: DecimalString.optional().nullable(),
    total: DecimalString.optional().nullable(),
    tariffRate: DecimalString.optional().nullable(),
    estimatedDutyCost: DecimalString.optional().nullable(),
    estimated3plCost: DecimalString.optional().nullable(),
    estimatedMargin: DecimalString.optional().nullable(),
    color: z.string().optional().nullable(),
    material: z.string().optional().nullable(),
    sizeBreakdown: z.record(z.string(), z.number()).optional().nullable(),
    productClass: z.string().optional().nullable(),
    collection: z.string().optional().nullable(),
});

export const saveOrderSchema = z.object({
    vpoNumber: z.string().min(1, 'VPO Number is required'),
    customerName: z.string().optional().nullable(),
    customerAddress: z.string().optional().nullable(),
    supplierName: z.string().optional().nullable(),
    supplierAddress: z.string().optional().nullable(),
    orderDate: DateString.optional().nullable(),
    totalAmount: DecimalString.optional().nullable(),
    status: z.string().optional().nullable(),
    soReference: z.string().optional().nullable(),
    expShipDate: DateString.optional().nullable(),
    cancelDate: DateString.optional().nullable(),
    shipTo: z.string().optional().nullable(),
    shipVia: z.string().optional().nullable(),
    shipmentTerms: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    customerNotes: z.string().optional().nullable(),
    workflowStatus: z.string().optional().nullable(),
    customerTermDays: z.number().int().optional().nullable(),
    vendorTermDays: z.number().int().optional().nullable(),
    logisticsTermDays: z.number().int().optional().nullable(),
    estimatedMargin: DecimalString.optional().nullable(),
    estimatedMarginRate: DecimalString.optional().nullable(),

    items: z.array(orderItemSchema).optional(),
});

// ==========================================
// Logistics Schemas
// ==========================================

export const containerSchema = z.object({
    containerNo: z.string().min(1, 'Container Number is required'),
    vesselName: z.string().optional().nullable(),
    status: z.string().optional().nullable(),
    etd: DateString.optional().nullable(),
    atd: DateString.optional().nullable(),
    eta: DateString.optional().nullable(),
    ata: DateString.optional().nullable(),
    arrivalAtWarehouse: DateString.optional().nullable(),
});

export const allocateContainerSchema = z.object({
    containerId: z.string().uuid(),
    orderId: z.string().uuid(),
    orderItemId: z.string().uuid().optional().nullable(),
    allocatedQty: z.number().int().nonnegative().optional().nullable(),
    allocatedAmount: DecimalString.optional().nullable(),
    notes: z.string().optional().nullable(),
});

export const shippingDocSchema = z.object({
    docNo: z.string().min(1, 'Document Number is required'),
    orderId: z.string().uuid(),
    containerId: z.string().uuid().optional().nullable(),
    status: z.string().optional().nullable(),
    payload: z.string().optional().nullable(),
});

// ==========================================
// Finance Schemas
// ==========================================

export const baseFinanceDocSchema = z.object({
    orderId: z.string().uuid(),
    containerId: z.string().uuid().optional().nullable(),
    dueDate: DateString.optional().nullable(),
    currency: z.string().optional().nullable(),
    amount: DecimalString,
    status: z.string().optional().nullable(),
});

export const commercialInvoiceSchema = baseFinanceDocSchema.extend({
    invoiceNo: z.string().min(1, 'Invoice Number is required'),
});

export const vendorBillSchema = baseFinanceDocSchema.extend({
    billNo: z.string().min(1, 'Bill Number is required'),
});

export const logisticsBillSchema = baseFinanceDocSchema.extend({
    billNo: z.string().min(1, 'Bill Number is required'),
    provider: z.string().optional().nullable(),
});

export const paymentSchema = z.object({
    targetType: z.enum(['CUSTOMER_INVOICE', 'VENDOR_BILL', 'LOGISTICS_BILL']),
    targetId: z.string().uuid(),
    direction: z.enum(['IN', 'OUT']),
    amount: DecimalString,
    method: z.string().optional().nullable(),
    referenceNo: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
});
