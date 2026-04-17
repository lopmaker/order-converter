export interface OrderItem {
    id: string;
    productCode: string | null;
    description: string | null;
    quantity: number | null;
    customerUnitPrice: string | null;
    vendorUnitPrice: string | null;
    total: string | null;
    tariffRate: string | null;
    estimatedDutyCost: string | null;
    estimated3plCost: string | null;
    estimatedMargin: string | null;
    collection: string | null;
    material: string | null;
    productClass: string | null;
}

export interface OrderDetails {
    id: string;
    vpoNumber: string;
    soReference: string | null;
    customerName: string | null;
    supplierName: string | null;
    shipTo: string | null;
    shipVia: string | null;
    orderDate: string | null;
    expShipDate: string | null;
    paymentTerms: string | null;
    workflowStatus: string | null;
    totalAmount: string | null;
    estimatedMargin: string | null;
    estimatedMarginRate: string | null;
    deliveredAt: string | null;
    closedAt: string | null;
    items: OrderItem[];
    customerAddress: string | null;
    supplierAddress: string | null;
    shipmentTerms: string | null;
    agent: string | null;
    cancelDate: string | null;
}

export interface DocSummary {
    id: string;
    code: string;
    amount: number;
    paid: number;
    outstanding: number;
    dueDate: string | null;
    status: string | null;
}

export interface FinanceSummary {
    invoices: DocSummary[];
    vendorBills: DocSummary[];
    logisticsBills: DocSummary[];
    totals: {
        receivable: number;
        receivablePaid: number;
        receivableOutstanding: number;
        vendorPayable: number;
        vendorPaid: number;
        vendorOutstanding: number;
        logisticsPayable: number;
        logisticsPaid: number;
        logisticsOutstanding: number;
    };
}

export interface ShippingDocRow {
    id: string;
    docNo: string;
    containerId: string | null;
    issueDate: string | null;
    status: string | null;
}

export interface AllocationRow {
    id: string;
    containerId: string;
    allocatedQty: number | null;
    allocatedAmount: string | null;
    createdAt: string | null;
}

export interface ContainerRow {
    id: string;
    containerNo: string;
    vesselName: string | null;
    status: string | null;
    atd: string | null;
    eta: string | null;
    ata: string | null;
    arrivalAtWarehouse: string | null;
}

export interface TimelineEvent {
    id: string;
    at: string | null;
    type: string;
    title: string;
    description: string | null;
    status: string | null;
    entityType: string;
    entityId: string;
    amount: number | null;
}

export interface TimelineResponse {
    events: TimelineEvent[];
}

export interface PaymentRow {
    id: string;
    targetType: 'CUSTOMER_INVOICE' | 'VENDOR_BILL' | 'LOGISTICS_BILL';
    targetId: string;
    targetCode?: string;
    direction: 'IN' | 'OUT';
    amount: string | null;
    paymentDate: string | null;
    method: string | null;
    referenceNo: string | null;
    notes: string | null;
}

export type WorkflowAction = 'GENERATE_SHIPPING_DOC' | 'START_TRANSIT' | 'MARK_DELIVERED';
export type RollbackAction = 'UNDO_MARK_DELIVERED' | 'UNDO_START_TRANSIT' | 'UNDO_SHIPPING_DOC';

export const AUTO_CONTAINER = 'AUTO';
