/**
 * Declarative workflow stage table for a VPO (客户采购单).
 *
 * The existing 5 status values in the database are preserved as-is:
 *   PO_UPLOADED (下单) → SHIPPING_DOC_SENT (已发货单) → IN_TRANSIT (物流/结算中)
 *   → AR_AP_OPEN (收付款跟踪) → CLOSED (已关闭)
 *
 * Stage is *derived* from existing records (container allocations, shipping docs,
 * commercial invoices, vendor/logistics bills, payment status, delivery timestamp)
 * rather than stored as a transition. This keeps the view in sync with the data
 * even after manual edits (delete/re-create/fix).
 *
 * Adding a new stage or changing derivation: edit STAGE_DEFINITIONS below.
 */

export const WORKFLOW_STAGES = [
  'PO_UPLOADED',
  'SHIPPING_DOC_SENT',
  'IN_TRANSIT',
  'AR_AP_OPEN',
  'CLOSED',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export type StageContext = {
  hasContainerAllocations: boolean;
  hasShippingDocs: boolean;
  hasCommercialInvoices: boolean;
  hasVendorBills: boolean;
  hasLogisticsBills: boolean;
  hasFinanceDocs: boolean; // invoices OR vendor bills OR logistics bills
  allFinanceDocsPaid: boolean;
  deliveredAt: Date | null;
};

export type StageDefinition = {
  code: WorkflowStage;
  labelZh: string;
  labelEn: string;
  description: string;
  matches: (ctx: StageContext) => boolean;
};

// Ordered highest-progress first. `deriveStage` returns the first match.
export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  {
    code: 'CLOSED',
    labelZh: '已关闭',
    labelEn: 'Closed',
    description: '已交付且所有 AR/AP 单据已付清',
    matches: (ctx) => !!ctx.deliveredAt && ctx.hasFinanceDocs && ctx.allFinanceDocsPaid,
  },
  {
    code: 'AR_AP_OPEN',
    labelZh: '收付款跟踪',
    labelEn: 'AR/AP Open',
    description: '已交付，跟踪客户回款与付工厂款',
    matches: (ctx) => !!ctx.deliveredAt,
  },
  {
    code: 'IN_TRANSIT',
    labelZh: '物流/结算中',
    labelEn: 'In Transit',
    description: '已开出商业发票 / 工厂账单，货物在途',
    matches: (ctx) => ctx.hasCommercialInvoices || ctx.hasVendorBills || ctx.hasLogisticsBills,
  },
  {
    code: 'SHIPPING_DOC_SENT',
    labelZh: '已发发货单',
    labelEn: 'Shipping Doc Sent',
    description: '发货单已生成（装柜或订舱）',
    matches: (ctx) => ctx.hasShippingDocs || ctx.hasContainerAllocations,
  },
  {
    code: 'PO_UPLOADED',
    labelZh: '已下单',
    labelEn: 'PO Uploaded',
    description: '客户 PDF 已录入，等待安排发货',
    matches: () => true,
  },
];

export const STAGE_BY_CODE: Record<WorkflowStage, StageDefinition> = STAGE_DEFINITIONS.reduce(
  (map, def) => {
    map[def.code] = def;
    return map;
  },
  {} as Record<WorkflowStage, StageDefinition>
);

/** Derive a VPO's stage from its current data snapshot. */
export function deriveStage(ctx: StageContext): WorkflowStage {
  for (const def of STAGE_DEFINITIONS) {
    if (def.matches(ctx)) return def.code;
  }
  return 'PO_UPLOADED';
}

export function getStageLabelZh(stage: string | null | undefined): string {
  if (!stage) return STAGE_BY_CODE.PO_UPLOADED.labelZh;
  const def = STAGE_BY_CODE[stage as WorkflowStage];
  return def ? def.labelZh : stage;
}

export function getStageLabelEn(stage: string | null | undefined): string {
  if (!stage) return STAGE_BY_CODE.PO_UPLOADED.labelEn;
  const def = STAGE_BY_CODE[stage as WorkflowStage];
  return def ? def.labelEn : stage;
}
