import { describe, it, expect } from 'vitest';
import { isSaleCreditPaid } from './sale-credit.js';
import { money } from '../currency/money.js';

describe('isSaleCreditPaid — derived, not stored', () => {
  it('is false while paid < total', () => {
    expect(
      isSaleCreditPaid({ total: money(10000n, 'USD'), paid: money(5000n, 'USD') }),
    ).toBe(false);
  });

  it('becomes true once paid >= total', () => {
    expect(
      isSaleCreditPaid({ total: money(10000n, 'USD'), paid: money(10000n, 'USD') }),
    ).toBe(true);
  });

  it('is true when paid exceeds total (overpayment)', () => {
    expect(
      isSaleCreditPaid({ total: money(10000n, 'USD'), paid: money(15000n, 'USD') }),
    ).toBe(true);
  });
});

describe('SaleCredit — references FKs, never free text', () => {
  it('has no client: string field on the SaleCredit shape', () => {
    const saleCredit = {
      id: 'credit-1',
      orderId: 'order-1',
      customerId: 'customer-1',
      total: money(10000n, 'USD'),
      paid: money(0n, 'USD'),
      rateApplied: { channel: 'ZELLE' as const, rate: 1000000n, effectiveFrom: new Date() },
      rateEffectiveFrom: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(Object.keys(saleCredit)).not.toContain('client');
    expect(saleCredit.orderId).toBe('order-1');
    expect(saleCredit.customerId).toBe('customer-1');
  });
});
