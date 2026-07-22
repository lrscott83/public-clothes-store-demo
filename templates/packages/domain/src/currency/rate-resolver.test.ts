import { describe, it, expect } from 'vitest';
import { resolverTasa, convertir, convertirEntreMonedas } from './rate-resolver.js';
import { RateNotFoundError } from './errors.js';
import { money } from './money.js';
import type { ExchangeRate } from './exchange-rate.js';

function rate(
  channel: ExchangeRate['channel'],
  decimal6: bigint,
  effectiveFrom: string,
  id?: string,
): ExchangeRate {
  return { channel, rate: decimal6, effectiveFrom: new Date(effectiveFrom), id };
}

describe('resolverTasa — own rate', () => {
  it('ZELLE with a channel-specific row returns that rate', () => {
    const rates: ExchangeRate[] = [rate('ZELLE', 1000000n, '2026-01-01T00:00:00Z')];
    const resolved = resolverTasa(rates, 'ZELLE', new Date('2026-02-01T00:00:00Z'));
    expect(resolved.rate).toBe(1000000n);
    expect(resolved.source.channel).toBe('ZELLE');
  });

  it('a persisted row (with an id) passes its real id through unchanged', () => {
    const rates: ExchangeRate[] = [rate('ZELLE', 1000000n, '2026-01-01T00:00:00Z', 'rate-uuid-1')];
    const resolved = resolverTasa(rates, 'ZELLE', new Date('2026-02-01T00:00:00Z'));
    expect(resolved.source.id).toBe('rate-uuid-1');
  });

  it('picks the latest row effective at or before the query moment', () => {
    const rates: ExchangeRate[] = [
      rate('MN_TRANSFERENCIA', 340000000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 350455000n, '2026-03-01T00:00:00Z'),
    ];
    const resolved = resolverTasa(rates, 'MN_TRANSFERENCIA', new Date('2026-02-15T00:00:00Z'));
    expect(resolved.rate).toBe(340000000n);
  });
});

describe('resolverTasa — currency fallback', () => {
  it('USD_EFECTIVO with no own row falls back to the USD pivot rate (=1), never an error', () => {
    const rates: ExchangeRate[] = [];
    const resolved = resolverTasa(rates, 'USD_EFECTIVO', new Date('2026-02-01T00:00:00Z'));
    expect(resolved.rate).toBe(1000000n);
  });

  it('the fabricated USD identity pivot row has no id — never a fabricated value, only absent', () => {
    const rates: ExchangeRate[] = [];
    const resolved = resolverTasa(rates, 'USD_EFECTIVO', new Date('2026-02-01T00:00:00Z'));
    expect(resolved.source.id).toBeUndefined();
  });

  it('falls back to another channel settling the same currency when the channel has no own row', () => {
    const rates: ExchangeRate[] = [rate('MN_EFECTIVO', 355000000n, '2026-01-01T00:00:00Z')];
    const resolved = resolverTasa(rates, 'MN_TRANSFERENCIA', new Date('2026-02-01T00:00:00Z'));
    expect(resolved.rate).toBe(355000000n);
    expect(resolved.source.channel).toBe('MN_EFECTIVO');
  });
});

describe('resolverTasa — explicit error', () => {
  it('throws RateNotFoundError when neither the channel nor its currency resolves', () => {
    const rates: ExchangeRate[] = [];
    expect(() =>
      resolverTasa(rates, 'MN_TRANSFERENCIA', new Date('2026-02-01T00:00:00Z')),
    ).toThrow(RateNotFoundError);
  });

  it('never returns 0 or null on the not-found path', () => {
    const rates: ExchangeRate[] = [];
    try {
      resolverTasa(rates, 'EUR_EFECTIVO', new Date('2026-02-01T00:00:00Z'));
      expect.unreachable('resolverTasa must throw, not return');
    } catch (err) {
      expect(err).toBeInstanceOf(RateNotFoundError);
    }
  });
});

describe('convertir — USD pivot conversion, rate direction pinned', () => {
  it('converts EUR (via EUR_EFECTIVO) to MN through the USD pivot with rates expressed as currency-per-USD', () => {
    // Rates are pinned as "1 USD = X currency" (currency-per-USD), NEVER USD-per-currency.
    // EUR_EFECTIVO: 1 USD = 0.920000 EUR  ->  1 EUR = 1/0.92 USD ≈ 1.086957 USD
    // MN_TRANSFERENCIA: 1 USD = 350.455000 MN
    const rates: ExchangeRate[] = [
      rate('EUR_EFECTIVO', 920000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 350455000n, '2026-01-01T00:00:00Z'),
    ];
    const origen = money(10000n, 'EUR'); // 100.00 EUR
    const result = convertir(rates, origen, 'EUR_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));

    // Exact bigint computation (verified independently): 100 EUR / 0.92 USD-per-EUR
    // -> ~108.695652 USD -> * 350.455 MN-per-USD -> 38092.93 MN (single HALF-UP round).
    expect(result.money.currency).toBe('MN');
    expect(result.money.minorUnits).toBe(3809293n);
    expect(result.rateApplied.channel).toBe('MN_TRANSFERENCIA');
  });

  it('would silently corrupt the result if the rate direction were inverted (USD-per-currency instead of currency-per-USD)', () => {
    // A buggy implementation that treats `rate` as "1 currency = rate USD"
    // (inverted contract) instead of "1 USD = rate currency" produces 26n for
    // this exact fixture — wildly different from the correct 3809293n above.
    // This test pins the CORRECT direction so an inversion regression fails loudly.
    const rates: ExchangeRate[] = [
      rate('EUR_EFECTIVO', 920000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 350455000n, '2026-01-01T00:00:00Z'),
    ];
    const origen = money(10000n, 'EUR');
    const result = convertir(rates, origen, 'EUR_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));
    expect(result.money.minorUnits).not.toBe(26n); // the inverted-direction (wrong) figure
  });
});

describe('convertir — rounding: single HALF-UP division, no intermediate drift', () => {
  it('rounds a .5 minor-unit boundary HALF-UP and matches the single-rounding result, not a two-step-rounded one', () => {
    // Handcrafted fixture: origin=0.09 EUR, EUR rate=0.648000 (EUR per USD),
    // MN rate=182.700000 (MN per USD). The single exact-rational computation
    // lands exactly on 2537.5 minor units -> HALF-UP -> 2538.
    // A naive two-step computation that rounds the intermediate USD leg first
    // produces 2558 instead — a 20-cent drift this test must reject.
    const rates: ExchangeRate[] = [
      rate('EUR_EFECTIVO', 648000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 182700000n, '2026-01-01T00:00:00Z'),
    ];
    const origen = money(9n, 'EUR'); // 0.09 EUR
    const result = convertir(rates, origen, 'EUR_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money.minorUnits).toBe(2538n);
    expect(result.money.minorUnits).not.toBe(2558n); // the two-step-rounded (wrong) figure
  });
});

describe('convertir — bigint overflow safety', () => {
  it('computes exactly with bigint where the equivalent Number product overflows MAX_SAFE_INTEGER', () => {
    const rates: ExchangeRate[] = [
      rate('EUR_EFECTIVO', 920000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 350455000n, '2026-01-01T00:00:00Z'),
    ];
    // 1,000,000.00 EUR: minorUnits = 100_000_000n, rate scale-6 ~3.5e8
    // Number(minorUnits) * Number(rate) ~= 3.5e16, which exceeds
    // Number.MAX_SAFE_INTEGER (~9.007e15) and would silently lose precision.
    const origen = money(100_000_000n, 'EUR');
    const naiveProductAsNumber = Number(origen.minorUnits) * Number(350455000n);
    expect(naiveProductAsNumber).toBeGreaterThan(Number.MAX_SAFE_INTEGER);

    const result = convertir(rates, origen, 'EUR_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));
    // Exact bigint computation (verified independently) — no precision loss despite
    // the intermediate numerator vastly exceeding Number.MAX_SAFE_INTEGER.
    expect(result.money.minorUnits).toBe(38092934783n);
  });
});

describe('convertir — same-currency soft-resolve (new branch, decision #5)', () => {
  it('same-currency with an existing rate applies the resolved rate, not a blind passthrough', () => {
    const rates: ExchangeRate[] = [rate('MN_EFECTIVO', 355000000n, '2026-01-01T00:00:00Z')];
    const origen = money(50000n, 'MN');
    const result = convertir(rates, origen, 'MN_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money).toEqual(origen);
    expect(result.rateApplied.rate).toBe(355000000n);
    expect(result.rateApplied.channel).toBe('MN_EFECTIVO');
  });

  it('same-currency with NO resolvable rate falls back to a synthetic 1x1 identity instead of throwing', () => {
    const rates: ExchangeRate[] = [];
    const origen = money(50000n, 'MN');
    const result = convertir(rates, origen, 'MN_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money).toEqual(origen);
    expect(result.rateApplied.id).toBeUndefined();
  });

  it('cross-currency with no rate still throws RateNotFoundError — never defaults to 1x1 (regression guard)', () => {
    const rates: ExchangeRate[] = [];
    const origen = money(50000n, 'EUR');
    expect(() =>
      convertir(rates, origen, 'EUR_EFECTIVO', 'MN', new Date('2026-02-01T00:00:00Z')),
    ).toThrow(RateNotFoundError);
  });
});

describe('convertirEntreMonedas — channel-less currency-to-currency conversion (decision #6)', () => {
  it('has no PaymentChannel parameter — arity is exactly 4 (rates, origen, monedaDestino, at)', () => {
    expect(convertirEntreMonedas.length).toBe(4);
  });

  it('same-currency with a resolvable rate uses it, not a blind passthrough', () => {
    const rates: ExchangeRate[] = [rate('MN_TRANSFERENCIA', 355000000n, '2026-01-01T00:00:00Z')];
    const origen = money(20000n, 'MN');
    const result = convertirEntreMonedas(rates, origen, 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money).toEqual(origen);
    expect(result.rateApplied.rate).toBe(355000000n);
  });

  it('same-currency with no resolvable rate falls back to 1x1 identity', () => {
    const rates: ExchangeRate[] = [];
    const origen = money(20000n, 'MN');
    const result = convertirEntreMonedas(rates, origen, 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money).toEqual(origen);
    expect(result.rateApplied.id).toBeUndefined();
  });

  it('cross-currency computes origen -> USD -> destino with ONE HALF-UP rounding, stamping the origen-side rate', () => {
    // Same fixture as `convertir`'s pivot test: EUR->MN via resolveRateForCurrency on both sides.
    const rates: ExchangeRate[] = [
      rate('EUR_EFECTIVO', 920000n, '2026-01-01T00:00:00Z'),
      rate('MN_TRANSFERENCIA', 350455000n, '2026-01-01T00:00:00Z'),
    ];
    const origen = money(10000n, 'EUR'); // 100.00 EUR
    const result = convertirEntreMonedas(rates, origen, 'MN', new Date('2026-02-01T00:00:00Z'));

    expect(result.money.currency).toBe('MN');
    expect(result.money.minorUnits).toBe(3809293n);
    // origen-side (product-native) rate is stamped — the rate that priced the foreign line.
    expect(result.rateApplied.channel).toBe('EUR_EFECTIVO');
  });

  it('cross-currency with no resolvable destination rate throws RateNotFoundError, never defaults to 1x1', () => {
    const rates: ExchangeRate[] = [rate('EUR_EFECTIVO', 920000n, '2026-01-01T00:00:00Z')];
    const origen = money(10000n, 'EUR');
    expect(() =>
      convertirEntreMonedas(rates, origen, 'MN', new Date('2026-02-01T00:00:00Z')),
    ).toThrow(RateNotFoundError);
  });
});
