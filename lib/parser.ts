export interface OrderItem {
    productCode: string;
    description: string;
    productClass?: string;
    collection?: string;
    material?: string;
    color?: string;
    customerUnitPrice?: number;
    vendorUnitPrice?: number;
    unitPrice: number;
    totalQty: number;
    extension: number;
    sizeBreakdown?: Record<string, number>;
}

export interface ExtractedOrderData {
    // Header
    vpoNumber?: string;
    orderDate?: string;
    expShipDate?: string;
    cancelDate?: string;
    soReference?: string;

    // Customer (buyer)
    customerName?: string;
    customerAddress?: string;

    // Supplier (factory)
    supplierName?: string;
    supplierAddress?: string;

    // Shipping
    shipTo?: string;
    shipVia?: string;
    shipmentTerms?: string;
    paymentTerms?: string;

    // Agent
    agent?: string;

    // Notes
    customerNotes?: string;

    // Line Items
    items: OrderItem[];
}

/**
 * Basic heuristic parser (fallback when AI is unavailable)
 */
export function parseOrderText(text: string): ExtractedOrderData {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const data: ExtractedOrderData = {
        items: []
    };

    // VPO Number
    const vpoLine = lines.find(l => /VPO[-\s]?\d+/i.test(l));
    if (vpoLine) {
        const match = vpoLine.match(/(VPO[-\s]?\d+)/i);
        if (match) data.vpoNumber = match[1];
    }

    // PO Number fallback
    if (!data.vpoNumber) {
        const poLine = lines.find(l => /P\.?O\.?\s*#?\s*[:.]?\s*\S+/i.test(l));
        if (poLine) {
            const match = poLine.match(/(?:P\.?O\.?\s*#?)\s*[:.]?\s*(\S+)/i);
            if (match) data.vpoNumber = match[1];
        }
    }

    // Date
    const dateLine = lines.find(l => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(l));
    if (dateLine) {
        const match = dateLine.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
        if (match) data.orderDate = match[1];
    }

    return data;
}
