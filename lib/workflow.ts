export interface MarginInputs {
  customerUnitPrice: number;
  vendorUnitPrice: number;
  qty: number;
  tariffRate: number;
}

export interface MarginOutputs {
  customerRevenue: number;
  vendorCost: number;
  dutyCost: number;
  estimated3plCost: number;
  estimatedMargin: number;
  estimatedMarginRate: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function parseDecimalInput(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/**
 * User-defined estimate formula:
 * est_3pl_cost = (tariffRate * 0.5) * FOB(vendor) + 0.1 * qty
 */
export function calculateEstimatedMargin(input: MarginInputs): MarginOutputs {
  const qty = Math.max(0, input.qty);
  const customerUnit = Math.max(0, input.customerUnitPrice);
  const vendorUnit = Math.max(0, input.vendorUnitPrice);
  const tariffRate = Math.max(0, input.tariffRate);

  const customerRevenue = customerUnit * qty;
  const vendorCost = vendorUnit * qty;
  const dutyCost = vendorCost * tariffRate;
  const estimated3plCost = vendorCost * tariffRate * 0.5 + 0.1 * qty;
  const estimatedMargin = customerRevenue - vendorCost - dutyCost - estimated3plCost;
  const estimatedMarginRate = customerRevenue > 0 ? estimatedMargin / customerRevenue : 0;

  return {
    customerRevenue: round2(customerRevenue),
    vendorCost: round2(vendorCost),
    dutyCost: round2(dutyCost),
    estimated3plCost: round2(estimated3plCost),
    estimatedMargin: round2(estimatedMargin),
    estimatedMarginRate: round4(estimatedMarginRate),
  };
}

export function addDays(baseDate: Date, days: number): Date {
  const next = new Date(baseDate);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function sumPaidAmount(payments: Array<{ amount: string | number | null | undefined }>): number {
  return round2(
    payments.reduce((acc, payment) => acc + parseDecimalInput(payment.amount, 0), 0)
  );
}
