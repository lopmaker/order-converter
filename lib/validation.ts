import { z } from 'zod';

// Schema for a single order item
export const orderItemSchema = z.object({
  id: z.string().optional(), // ID is optional for new items, required for existing
  productCode: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().int().min(0).nullable().optional(),
  unitPrice: z.string().nullable().optional(), // Stored as string (decimal)
  customerUnitPrice: z.string().nullable().optional(),
  vendorUnitPrice: z.string().nullable().optional(),
  total: z.string().nullable().optional(), // Calculated, but good to have a schema
  tariffRate: z.string().nullable().optional(), // Calculated
  estimatedDutyCost: z.string().nullable().optional(), // Calculated
  estimated3plCost: z.string().nullable().optional(), // Calculated
  estimatedMargin: z.string().nullable().optional(), // Calculated
  color: z.string().nullable().optional(),
  material: z.string().nullable().optional(),
  sizeBreakdown: z.string().nullable().optional(),
  productClass: z.string().nullable().optional(),
  collection: z.string().nullable().optional(),
});

// Schema for updating an order (PATCH request)
export const orderPatchSchema = z.object({
  vpoNumber: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  customerAddress: z.string().nullable().optional(),
  supplierName: z.string().nullable().optional(),
  supplierAddress: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  workflowStatus: z.string().nullable().optional(),
  soReference: z.string().nullable().optional(),
  shipTo: z.string().nullable().optional(),
  shipVia: z.string().nullable().optional(),
  shipmentTerms: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  customerNotes: z.string().nullable().optional(),
  totalAmount: z.string().nullable().optional(),
  estimatedMargin: z.string().nullable().optional(),
  estimatedMarginRate: z.string().nullable().optional(),
  orderDate: z.string().datetime({ offset: true }).nullable().optional(), // ISO string date
  expShipDate: z.string().datetime({ offset: true }).nullable().optional(),
  cancelDate: z.string().datetime({ offset: true }).nullable().optional(),
  deliveredAt: z.string().datetime({ offset: true }).nullable().optional(),
  closedAt: z.string().datetime({ offset: true }).nullable().optional(),
  items: z.array(orderItemSchema).optional(),
});
