/**
 * Declarative 5-stage workflow for a VPO (客户采购单).
 *
 * Business stages:
 *   下单 (DRAFTING) → 生产 (PRODUCTION) → 物流 (LOGISTICS) → 结算 (SETTLEMENT) → 已关闭 (CLOSED)
 *
 * Stages are *derived* from existing records (production lots, container allocations,
 * commercial invoices, payment status, delivery timestamp) rather than stored as
 * transitions, so the view stays in sync with data even after manual edits.
 */

export const WORKFLOW_STAGES = [
  'DRAFTING',
  'PRODUCTION',
  'LOGISTICS',
  'SETTLEMENT',
  'CLOSED',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export type StageContext = {
  hasProductionLots: boolean;
  hasContainerAllocations: boolean;
  hasShippingDocs: boolean;
  hasCommercialInvoices: boolean;
  hasFinanceDocs: boolean;
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
    description: '已交付且所有应收/应付单据已付清',
    matches: (ctx) => !!ctx.deliveredAt && ctx.hasFinanceDocs && ctx.allFinanceDocsPaid,
  },
  {
    code: 'SETTLEMENT',
    labelZh: '结算',
    labelEn: 'Settlement',
    description: '已初运开商业发票或已交付，进入应收应付跟踪',
    matches: (ctx) => !!ctx.deliveredAt || ctx.hasCommercialInvoices,
  },
  {
    code: 'LOGISTICS',
    labelZh: '物流',
    labelEn: 'Logistics',
    description: '已装柜 / 报关 / 出运中',
    matches: (ctx) => ctx.hasContainerAllocations || ctx.hasShippingDocs,
  },
  {
    code: 'PRODUCTION',
    labelZh: '生产',
    labelEn: 'Production',
    description: '生产批次已建立，工厂排期中',
    matches: (ctx) => ctx.hasProductionLots,
  },
  {
    code: 'DRAFTING',
    labelZh: '下单',
    labelEn: 'Drafting',
    description: '客户 PDF 已录入、工厂价与毛利待确认',
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
  return 'DRAFTING';
}

export function getStageLabelZh(stage: string | null | undefined): string {
  if (!stage) return STAGE_BY_CODE.DRAFTING.labelZh;
  const def = STAGE_BY_CODE[stage as WorkflowStage];
  return def ? def.labelZh : stage;
}

export function getStageLabelEn(stage: string | null | undefined): string {
  if (!stage) return STAGE_BY_CODE.DRAFTING.labelEn;
  const def = STAGE_BY_CODE[stage as WorkflowStage];
  return def ? def.labelEn : stage;
}
