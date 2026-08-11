import { describe, it, expect } from 'vitest';
import { formatMoney } from './money';

/**
 * Phase 0, spike 0.4 — the one Risk-table entry rated High likelihood
 * (spec: public-catalog "Money Formatting Supports Non-ISO Currencies").
 * `MN` is not ISO 4217; the first test proves the risk is real (native
 * `Intl.NumberFormat` throws), the rest prove `formatMoney` — this app's
 * own formatter — never does, while still deferring to `Intl` for the two
 * real ISO currencies the catalog also sells in.
 */
describe('formatMoney', () => {
  it('proves the risk: native Intl.NumberFormat throws RangeError for currency "MN"', () => {
    expect(() => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'MN' })).toThrow(
      RangeError,
    );
  });

  it('formats currency "MN" without throwing, returning a string', () => {
    expect(() => formatMoney('1234.50', { locale: 'es-NI', currency: 'MN' })).not.toThrow();

    const result = formatMoney('1234.50', { locale: 'es-NI', currency: 'MN' });

    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats currency "MN" with the amount rendered and the code as a suffix', () => {
    const result = formatMoney('1234.50', { locale: 'en-US', currency: 'MN' });

    expect(result).toBe('1,234.50 MN');
  });

  it('formats USD via standard Intl.NumberFormat currency output', () => {
    const result = formatMoney('199.99', { locale: 'en-US', currency: 'USD' });

    expect(result).toBe(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(199.99));
    expect(result).toBe('$199.99');
  });

  it('formats EUR via standard Intl.NumberFormat currency output', () => {
    const result = formatMoney('1999.99', { locale: 'de-DE', currency: 'EUR' });

    expect(result).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(1999.99));
  });
});
