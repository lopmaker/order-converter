import { describe, it, expect } from 'vitest';
import { deriveStage, getStageLabelZh, type StageContext } from './workflow-stages';

const emptyCtx: StageContext = {
  hasProductionLots: false,
  hasContainerAllocations: false,
  hasShippingDocs: false,
  hasCommercialInvoices: false,
  hasFinanceDocs: false,
  allFinanceDocsPaid: false,
  deliveredAt: null,
};

describe('deriveStage', () => {
  it('returns DRAFTING for a brand-new order with nothing attached', () => {
    expect(deriveStage(emptyCtx)).toBe('DRAFTING');
  });

  it('advances to PRODUCTION once a production lot exists', () => {
    expect(deriveStage({ ...emptyCtx, hasProductionLots: true })).toBe('PRODUCTION');
  });

  it('advances to LOGISTICS once a container allocation exists', () => {
    expect(
      deriveStage({ ...emptyCtx, hasProductionLots: true, hasContainerAllocations: true })
    ).toBe('LOGISTICS');
  });

  it('advances to LOGISTICS via a shipping doc alone', () => {
    expect(deriveStage({ ...emptyCtx, hasShippingDocs: true })).toBe('LOGISTICS');
  });

  it('advances to SETTLEMENT once any commercial invoice is issued', () => {
    expect(
      deriveStage({ ...emptyCtx, hasContainerAllocations: true, hasCommercialInvoices: true })
    ).toBe('SETTLEMENT');
  });

  it('advances to SETTLEMENT once delivered (even without invoice)', () => {
    expect(deriveStage({ ...emptyCtx, deliveredAt: new Date() })).toBe('SETTLEMENT');
  });

  it('stays in SETTLEMENT when delivered but not all finance docs paid', () => {
    expect(
      deriveStage({
        ...emptyCtx,
        deliveredAt: new Date(),
        hasCommercialInvoices: true,
        hasFinanceDocs: true,
        allFinanceDocsPaid: false,
      })
    ).toBe('SETTLEMENT');
  });

  it('reaches CLOSED only when delivered AND all finance docs paid', () => {
    expect(
      deriveStage({
        ...emptyCtx,
        deliveredAt: new Date(),
        hasCommercialInvoices: true,
        hasFinanceDocs: true,
        allFinanceDocsPaid: true,
      })
    ).toBe('CLOSED');
  });

  it('does not reach CLOSED if there are no finance docs at all', () => {
    expect(deriveStage({ ...emptyCtx, deliveredAt: new Date(), allFinanceDocsPaid: true })).toBe(
      'SETTLEMENT'
    );
  });
});

describe('getStageLabelZh', () => {
  it('returns the Chinese label for a known stage', () => {
    expect(getStageLabelZh('PRODUCTION')).toBe('生产');
    expect(getStageLabelZh('CLOSED')).toBe('已关闭');
  });

  it('falls back to DRAFTING for null input', () => {
    expect(getStageLabelZh(null)).toBe('下单');
  });

  it('returns the code itself for unknown stage (forward-compat)', () => {
    expect(getStageLabelZh('UNKNOWN_STAGE')).toBe('UNKNOWN_STAGE');
  });
});
