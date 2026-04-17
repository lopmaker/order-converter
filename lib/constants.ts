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

// ─── Workflow Stage Enum ────────────────────────────────────────
//
// 5 business stages mirroring the trading company's real-world flow:
//   下单 (DRAFTING) → 生产 (PRODUCTION) → 物流 (LOGISTICS) → 结算 (SETTLEMENT) → 已关闭 (CLOSED)
//
// The authoritative stage definitions (labels, matchers) live in lib/workflow-stages.ts.

export const WORKFLOW_STATUS = {
  DRAFTING: 'DRAFTING',
  PRODUCTION: 'PRODUCTION',
  LOGISTICS: 'LOGISTICS',
  SETTLEMENT: 'SETTLEMENT',
  CLOSED: 'CLOSED',
} as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUS)[keyof typeof WORKFLOW_STATUS];
