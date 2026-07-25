import { describe, it, expect } from 'vitest';
import { buildOrderPayment } from './order-payment.js';
import { InvalidOrderError } from './errors.js';
import { money } from '../currency/money.js';
import type { ExchangeRate } from '../currency/exchange-rate.js';

const AT = new Date('2026-07-22T00:00:00Z');

describe('buildOrderPayment — split multi-channel collection', () => {
  it('same-currency (ZELLE settling USD, USD order) passes the amount through unchanged, identity rate', () => {
    const payment = buildOrderPayment(
      { channel: 'ZELLE', amount: money(6000n, 'USD') },
      'USD',
      [],
      AT,
    );
    expect(payment.amountInOrderCurrency.minorUnits).toBe(6000n);
    expect(payment.amountInOrderCurrency.currency).toBe('USD');
    expect(payment.rateApplied.id).toBeUndefined();
    expect(payment.rateEffectiveFrom).toEqual(AT);
  });

  it('converts amount (in CHANNEL_CURRENCY[channel]) to amountInOrderCurrency via convertir, stamping the DEST-side rateApplied+rateEffectiveFrom', () => {
    const rates: ExchangeRate[] = [
      {
        channel: 'MN_TRANSFER',
        rate: 300000000n, // 1 USD = 300.000000 MN
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        id: 'rate-mn',
      },
    ];
    const payment = buildOrderPayment(
      { channel: 'ZELLE', amount: money(6000n, 'USD') }, // 60.00 USD
      'MN',
      rates,
      AT,
    );
    // 60.00 USD * 300 MN/USD = 18000.00 MN
    expect(payment.amountInOrderCurrency.currency).toBe('MN');
    expect(payment.amountInOrderCurrency.minorUnits).toBe(1800000n);
    expect(payment.rateApplied.id).toBe('rate-mn');
    expect(payment.rateEffectiveFrom).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('rejects an amount whose currency does not match CHANNEL_CURRENCY[channel]', () => {
    expect(() =>
      buildOrderPayment({ channel: 'ZELLE', amount: money(6000n, 'MN') }, 'USD', [], AT),
    ).toThrow(InvalidOrderError);
  });

  it('rejects a zero or negative amount', () => {
    expect(() =>
      buildOrderPayment({ channel: 'ZELLE', amount: money(0n, 'USD') }, 'USD', [], AT),
    ).toThrow(InvalidOrderError);
  });
});
