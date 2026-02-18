/**
 * Centralised business constants.
 * Keeps hardcoded values out of component files and ensures
 * consistency across the entire application.
 */

// ─── Buyer Entities ─────────────────────────────────────────────

export const BUYER_OPTIONS = {
    NY: {
        name: 'Mijenro International LLC',
        address: '10740 Queens Blvd\nForest Hills, NY 11375',
    },
    HK: {
        name: 'Mijenro Hongkong Ltd',
        address:
            'Room 704, 7/F., Tower A, New Mandarin Plaza, 14 Science Museum Road, TST East, Kowloon, Hong Kong',
    },
} as const;

// ─── Payment Terms ──────────────────────────────────────────────

export const PAYMENT_TERMS = ['Net 60 days', 'Net 90 days'] as const;

// ─── Workflow Status Enum ───────────────────────────────────────

export const WORKFLOW_STATUS = {
    PO_UPLOADED: 'PO_UPLOADED',
    SHIPPING_DOC_SENT: 'SHIPPING_DOC_SENT',
    IN_TRANSIT: 'IN_TRANSIT',
    AR_AP_OPEN: 'AR_AP_OPEN',
    CLOSED: 'CLOSED',
} as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];
