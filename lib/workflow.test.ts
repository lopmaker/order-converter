import { describe, it, expect } from 'vitest';
import { calculateEstimatedMargin, parseDecimalInput, sumPaidAmount } from './workflow';

describe('calculateEstimatedMargin', () => {
  it('should calculate margins correctly with standard positive inputs', () => {
    const input = {
      customerUnitPrice: 100,
      vendorUnitPrice: 50,
      qty: 10,
      tariffRate: 0.1, // 10%
    };
    const result = calculateEstimatedMargin(input);
    expect(result.customerRevenue).toBe(1000);
    expect(result.vendorCost).toBe(500);
    expect(result.dutyCost).toBe(50);
    expect(result.estimated3plCost).toBe(21); // (500 * 0.1 * 0.4) + (0.1 * 10) = 20 + 1
    expect(result.estimatedMargin).toBe(479); // 1000 - 500 - 21
    expect(result.estimatedMarginRate).toBe(0.479); // 479 / 1000
  });

  it('should return all zeros when all inputs are zero', () => {
    const input = {
      customerUnitPrice: 0,
      vendorUnitPrice: 0,
      qty: 0,
      tariffRate: 0,
    };
    const result = calculateEstimatedMargin(input);
    expect(result.customerRevenue).toBe(0);
    expect(result.vendorCost).toBe(0);
    expect(result.dutyCost).toBe(0);
    expect(result.estimated3plCost).toBe(0);
    expect(result.estimatedMargin).toBe(0);
    expect(result.estimatedMarginRate).toBe(0);
  });

  it('should treat negative inputs as zero', () => {
    const input = {
      customerUnitPrice: -100,
      vendorUnitPrice: -50,
      qty: -10,
      tariffRate: -0.1,
    };
    const result = calculateEstimatedMargin(input);
    expect(result.customerRevenue).toBe(0);
    expect(result.vendorCost).toBe(0);
    expect(result.dutyCost).toBe(0);
    expect(result.estimated3plCost).toBe(0);
    expect(result.estimatedMargin).toBe(0);
    expect(result.estimatedMarginRate).toBe(0);
  });

  it('should calculate correctly when quantity is zero', () => {
    const input = {
      customerUnitPrice: 100,
      vendorUnitPrice: 50,
      qty: 0,
      tariffRate: 0.1,
    };
    const result = calculateEstimatedMargin(input);
    expect(result.customerRevenue).toBe(0);
    expect(result.vendorCost).toBe(0);
    expect(result.dutyCost).toBe(0);
    expect(result.estimated3plCost).toBe(0);
    expect(result.estimatedMargin).toBe(0);
    expect(result.estimatedMarginRate).toBe(0);
  });
});

describe('parseDecimalInput', () => {
  it('should return the number if input is a finite number', () => {
    expect(parseDecimalInput(123.45)).toBe(123.45);
    expect(parseDecimalInput(0)).toBe(0);
    expect(parseDecimalInput(-50)).toBe(-50);
  });

  it('should parse a valid string to a number', () => {
    expect(parseDecimalInput('123.45')).toBe(123.45);
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('-50.5')).toBe(-50.5);
  });

  it('should return fallback for invalid or non-numeric strings', () => {
    expect(parseDecimalInput('abc')).toBe(0);
    expect(parseDecimalInput('1,000')).toBe(0); // Contains comma
    expect(parseDecimalInput('')).toBe(0);
  });

  it('should return fallback for non-string, non-number types', () => {
    expect(parseDecimalInput(null)).toBe(0);
    expect(parseDecimalInput(undefined)).toBe(0);
    expect(parseDecimalInput({})).toBe(0);
    expect(parseDecimalInput([])).toBe(0);
  });

  it('should use provided fallback value', () => {
    expect(parseDecimalInput('invalid', 99)).toBe(99);
    expect(parseDecimalInput(null, -1)).toBe(-1);
  });
});

describe('sumPaidAmount', () => {
  it('should sum amounts from an array of objects', () => {
    const payments = [{ amount: 10.5 }, { amount: '20.25' }, { amount: 5 }];
    expect(sumPaidAmount(payments)).toBe(35.75);
  });

  it('should treat invalid or missing amounts as zero', () => {
    const payments = [
      { amount: 100 },
      { amount: 'invalid' },
      { amount: null },
      { amount: undefined },
      { amount: 50 },
    ];
    expect(sumPaidAmount(payments)).toBe(150);
  });

  it('should return 0 for an empty array', () => {
    expect(sumPaidAmount([])).toBe(0);
  });

  it('should handle rounding correctly', () => {
    const payments = [{ amount: 10.123 }, { amount: 20.456 }];
    expect(sumPaidAmount(payments)).toBe(30.58);
  });
});
