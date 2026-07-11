import { describe, expect, it } from 'vitest';
import {
  cartTotalUSD,
  convertTotal,
  currencyOptionLabel,
  formatConvertedTotal,
  formatPriceWithUSD,
  rateFor,
} from '../cart';
import type { ExchangeRates } from '../types';

const RATES: ExchangeRates = { usdToMn: 680, zelle: 1, eur: 0.92 };

describe('cartTotalUSD', () => {
  it('sums priceUSD * quantity across lines', () => {
    const lines = [
      { priceUSD: 100, quantity: 2 },
      { priceUSD: 50, quantity: 1 },
    ];

    expect(cartTotalUSD(lines)).toBe(250);
  });

  it('returns 0 for an empty cart', () => {
    expect(cartTotalUSD([])).toBe(0);
  });
});

describe('convertTotal', () => {
  it('returns identity for USD', () => {
    expect(convertTotal(250, 'USD', RATES)).toBe(250);
  });

  it('converts to MN using usdToMn rate', () => {
    expect(convertTotal(250, 'MN', RATES)).toBe(250 * 680);
  });

  it('converts to ZELLE using zelle rate', () => {
    expect(convertTotal(250, 'ZELLE', RATES)).toBe(250 * 1);
  });

  it('converts to EUR using eur rate', () => {
    expect(convertTotal(250, 'EUR', RATES)).toBe(250 * 0.92);
  });

  it('falls back to USD for unknown currency', () => {
    expect(convertTotal(250, 'GBP', RATES)).toBe(250);
  });
});

describe('formatConvertedTotal', () => {
  it('formats USD with dollar sign', () => {
    expect(formatConvertedTotal(250, 'USD')).toBe('$250.00');
  });

  it('formats MN with numeric value and MN suffix', () => {
    expect(formatConvertedTotal(170_000, 'MN')).toBe('170,000.00 MN');
  });

  it('formats ZELLE with dollar sign and (Zelle) suffix', () => {
    expect(formatConvertedTotal(250, 'ZELLE')).toBe('$250.00 (Zelle)');
  });

  it('formats EUR with euro sign', () => {
    expect(formatConvertedTotal(230, 'EUR')).toBe('€230.00');
  });

  it('falls back to USD format for unknown currency', () => {
    expect(formatConvertedTotal(250, 'GBP')).toBe('$250.00');
  });
});

describe('rateFor', () => {
  it('returns 1 for USD and the matching rate for each other currency', () => {
    expect(rateFor('USD', RATES)).toBe(1);
    expect(rateFor('MN', RATES)).toBe(680);
    expect(rateFor('ZELLE', RATES)).toBe(1);
    expect(rateFor('EUR', RATES)).toBe(0.92);
  });

  it('falls back to 1 for an unknown currency', () => {
    expect(rateFor('GBP', RATES)).toBe(1);
  });
});

describe('currencyOptionLabel', () => {
  it('appends the exchange rate in parentheses', () => {
    expect(currencyOptionLabel('MN', RATES)).toBe('MN (680)');
    expect(currencyOptionLabel('USD', RATES)).toBe('USD (1)');
    expect(currencyOptionLabel('EUR', RATES)).toBe('EUR (0.92)');
  });
});

describe('formatPriceWithUSD', () => {
  it('returns plain USD when the selected currency is USD', () => {
    expect(formatPriceWithUSD(15, 'USD', RATES)).toBe('$15.00');
  });

  it('shows the converted amount + currency with the USD price in parentheses', () => {
    expect(formatPriceWithUSD(15, 'MN', RATES)).toBe('10,200.00 MN ($15.00)');
  });

  it('is uniform across non-USD currencies (amount + code + USD in parens)', () => {
    expect(formatPriceWithUSD(10, 'ZELLE', RATES)).toBe('10.00 ZELLE ($10.00)');
  });
});
