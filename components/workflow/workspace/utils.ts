import {
    OrderDetails,
    ShippingDocRow,
    AllocationRow,
    FinanceSummary
} from './types';

export function statusBadgeVariant(
    status: string | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
    const normalized = (status || '').toUpperCase();
    if (normalized === 'CLOSED' || normalized === 'PAID') return 'default';
    if (normalized === 'AR_AP_OPEN' || normalized === 'PARTIAL') return 'secondary';
    if (normalized === 'OPEN' || normalized === 'IN_TRANSIT') return 'outline';
    if (normalized.includes('ERROR')) return 'destructive';
    return 'outline';
}

export function makeEmptyFinanceSummary(): FinanceSummary {
    return {
        invoices: [],
        vendorBills: [],
        logisticsBills: [],
        totals: {
            receivable: 0,
            receivablePaid: 0,
            receivableOutstanding: 0,
            vendorPayable: 0,
            vendorPaid: 0,
            vendorOutstanding: 0,
            logisticsPayable: 0,
            logisticsPaid: 0,
            logisticsOutstanding: 0,
        },
    };
}

export function nextStepHints(
    order: OrderDetails | null,
    shippingDocs: ShippingDocRow[],
    allocations: AllocationRow[],
    summary: FinanceSummary | null
) {
    if (!order) return [];
    const hints: string[] = [];
    if (allocations.length === 0) {
        hints.push(
            'Allocate this order to at least one container (optional now, recommended before transit).'
        );
    }
    if (shippingDocs.length === 0) {
        hints.push('Send shipping document to create 3PL shipment instruction.');
    }
    if (!summary || summary.invoices.length === 0) {
        hints.push('Open customer AR (commercial invoice).');
    }
    if (!summary || summary.vendorBills.length === 0) {
        hints.push('Open factory AP (vendor bill).');
    }
    if (order.deliveredAt && (!summary || summary.logisticsBills.length === 0)) {
        hints.push('Open 3PL AP after warehouse delivery.');
    }
    if (summary) {
        const outstanding =
            summary.totals.receivableOutstanding +
            summary.totals.vendorOutstanding +
            summary.totals.logisticsOutstanding;
        if (outstanding > 0) {
            hints.push('Post remaining payments to move order to CLOSED automatically.');
        }
    }
    if (hints.length === 0) {
        hints.push('No pending action. Workflow is complete or fully up to date.');
    }
    return hints;
}
