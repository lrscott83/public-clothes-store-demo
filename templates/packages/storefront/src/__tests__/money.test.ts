import { describe, it, expect, vi } from 'vitest';
import { formatMoney } from '../config/money';

describe('formatMoney', () => {
  it('formats es-NI locale with NIO currency per es-NI/NIO conventions', () => {
    const result = formatMoney(1234.5, { locale: 'es-NI', currency: 'NIO' });

    expect(result).toBe(new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(1234.5));
    expect(result).toMatch(/1[.,]234[.,]50/);
  });

  it('formats en-US locale with USD currency per en-US/USD conventions', () => {
    const result = formatMoney(1999.99, { locale: 'en-US', currency: 'USD' });

    expect(result).toBe('$1,999.99');
  });

  it('respects a currency override independent of a previous call locale', () => {
    const usd = formatMoney(10, { locale: 'en-US', currency: 'USD' });
    const eur = formatMoney(10, { locale: 'en-US', currency: 'EUR' });

    expect(usd).toBe('$10.00');
    expect(eur).not.toBe(usd);
    expect(eur).toContain('10.00');
  });

  it('memoizes the Intl.NumberFormat instance per locale+currency pair', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');

    formatMoney(10, { locale: 'de-DE', currency: 'EUR' });
    formatMoney(20, { locale: 'de-DE', currency: 'EUR' });
    expect(spy).toHaveBeenCalledTimes(1);

    formatMoney(30, { locale: 'de-DE', currency: 'CHF' });
    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
});
