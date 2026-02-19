import type { ExtractedOrderData } from '@/lib/parser';
import { orders } from '@/db/schema';

/**
 * Represents a file being processed in the front-end UI.
 * This is a client-side only type used to track the state of uploaded files
 * through the parsing and validation pipeline.
 */
export interface OrderFile {
  /** A unique client-side identifier for the file. */
  id: string;
  /** The actual File object, present only on the client. */
  file?: File;
  fileName?: string;
  fileSize?: number;
  /** The current processing status of the file. */
  status: 'idle' | 'processing' | 'completed' | 'error';
  /** The structured data extracted from the PDF, available on completion. */
  data?: ExtractedOrderData;
  /** An error message if processing fails. */
  error?: string;
  /** A string describing the current step of the processing pipeline (e.g., 'Extracting text...'). */
  processingStep?: string;
  /** The raw text extracted from the PDF. */
  originalText?: string;
}

/**
 * Represents a complete order record as stored in the database.
 * This type is inferred directly from the Drizzle schema.
 */
export type Order = typeof orders.$inferSelect;

/**
 * A version of the Order type where all Date fields have been serialized to ISO strings.
 * This is necessary for passing order data from Server Components to Client Components,
 * as Date objects are not serializable and cannot be passed as props directly.
 */
export type SerializedOrder = Omit<Order, 'orderDate' | 'expShipDate' | 'cancelDate' | 'deliveredAt' | 'closedAt' | 'createdAt'> & {
  orderDate: string | null;
  expShipDate: string | null;
  cancelDate: string | null;
  deliveredAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
};

export interface OrderItem {
  id: string;
  productCode: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: string | null;
  customerUnitPrice: string | null;
  vendorUnitPrice: string | null;
  total: string | null;
  tariffRate: string | null;
  estimatedDutyCost: string | null;
  estimated3plCost: string | null;
  estimatedMargin: string | null;
  color: string | null;
  material: string | null;
  sizeBreakdown: string | null;
  productClass: string | null;
  collection: string | null;
}

/**
 * Represents a fully-hydrated order, including its associated line items.
 * This is often used when fetching a single order's complete details for display or editing.
 */
export interface OrderWithItems extends SerializedOrder {
  items?: OrderItem[];
}
