import { describe, it, expect } from 'vitest';
import { deriveStage, getStageLabelZh, type StageContext } from './workflow-stages';

const emptyCtx: StageContext = {
  hasContainerAllocations: false,
  hasShippingDocs: false,
  hasCommercialInvoices: false,
  hasVendorBills: false,
  hasLogisticsBills: false,
  hasFinanceDocs: false,
  allFinanceDocsPaid: false,
  deliveredAt: null,
};

describe('deriveStage', () => {
  it('returns PO_UPLOADED for a brand-new order with nothing attached', () => {
    expect(deriveStage(emptyCtx)).toBe('PO_UPLOADED');
  });

  it('advances to SHIPPING_DOC_SENT once a container allocation exists', () => {
    expect(deriveStage({ ...emptyCtx, hasContainerAllocations: true })).toBe('SHIPPING_DOC_SENT');
  });

  it('advances to SHIPPING_DOC_SENT via a shipping doc alone', () => {
    expect(deriveStage({ ...emptyCtx, hasShippingDocs: true })).toBe('SHIPPING_DOC_SENT');
  });

  it('advances to IN_TRANSIT once a commercial invoice is issued', () => {
    expect(
      deriveStage({
        ...emptyCtx,
        hasContainerAllocations: true,
        hasCommercialInvoices: true,
        hasFinanceDocs: true,
      })
    ).toBe('IN_TRANSIT');
  });

  it('advances to IN_TRANSIT once a vendor bill is issued (even without invoice)', () => {
    expect(
      deriveStage({ ...emptyCtx, hasVendorBills: true, hasFinanceDocs: true })
    ).toBe('IN_TRANSIT');
  });

  it('advances to AR_AP_OPEN once delivered (even without finance docs)', () => {
    expect(deriveStage({ ...emptyCtx, deliveredAt: new Date() })).toBe('AR_AP_OPEN');
  });

  it('stays in AR_AP_OPEN when delivered but not all paid', () => {
    expect(
      deriveStage({
        ...emptyCtx,
        deliveredAt: new Date(),
        hasCommercialInvoices: true,
        hasFinanceDocs: true,
        allFinanceDocsPaid: false,
      })
    ).toBe('AR_AP_OPEN');
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
      'AR_AP_OPEN'
    );
  });
});

describe('getStageLabelZh', () => {
  it('returns the Chinese label for a known stage', () => {
    expect(getStageLabelZh('IN_TRANSIT')).toBe('物流/结算中');
    expect(getStageLabelZh('CLOSED')).toBe('已关闭');
  });

  it('falls back to PO_UPLOADED for null input', () => {
    expect(getStageLabelZh(null)).toBe('已下单');
  });

  it('returns the code itself for unknown stage (forward-compat)', () => {
    expect(getStageLabelZh('UNKNOWN_STAGE')).toBe('UNKNOWN_STAGE');
  });
});
