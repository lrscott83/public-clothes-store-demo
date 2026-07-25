import type { Currency, Money } from './money.js';
import { MONEY_SCALE } from './money.js';
import type { PaymentChannel } from './payment-channel.js';
import { CHANNEL_CURRENCY } from './payment-channel.js';
import type { ExchangeRate } from './exchange-rate.js';
import { RATE_SCALE } from './exchange-rate.js';
import { InvalidMoneyError, RateNotFoundError } from './errors.js';

/** USD is the pivot: 1 USD = 1 USD, always, by construction. */
const USD_IDENTITY_RATE = 10n ** BigInt(RATE_SCALE);

export interface ResolvedRate {
  readonly rate: bigint;
  readonly source: ExchangeRate;
}

export interface ConversionResult {
  readonly money: Money;
  readonly rateApplied: ExchangeRate;
}

function latestEffective(rows: ExchangeRate[], at: Date): ExchangeRate | undefined {
  let latest: ExchangeRate | undefined;
  for (const row of rows) {
    if (row.effectiveFrom.getTime() > at.getTime()) continue;
    if (!latest || row.effectiveFrom.getTime() > latest.effectiveFrom.getTime()) {
      latest = row;
    }
  }
  return latest;
}

/**
 * Resolves the current rate for a bare currency (used both as step 2 of the
 * channel cascade and directly for the destination side of `convert`, which
 * only knows a target currency, not a target channel).
 */
function resolveRateForCurrency(
  rates: ExchangeRate[],
  currency: Currency,
  at: Date,
): ResolvedRate {
  if (currency === 'USD') {
    // Fabricated pivot row — never persisted, so `id` is explicitly absent
    // (never a fake/fabricated UUID). Never omit this comment when touching
    // this branch: callers (e.g. the API's RateResponseDto) rely on the
    // absence of `id` to distinguish "synthetic" from "real DB row".
    return {
      rate: USD_IDENTITY_RATE,
      source: { channel: 'ZELLE', rate: USD_IDENTITY_RATE, effectiveFrom: at, id: undefined },
    };
  }
  const candidates = rates.filter((r) => CHANNEL_CURRENCY[r.channel] === currency);
  const latest = latestEffective(candidates, at);
  if (!latest) {
    throw new RateNotFoundError(
      `No rate resolvable for currency "${currency}" at ${at.toISOString()}`,
    );
  }
  return { rate: latest.rate, source: latest };
}

/**
 * Pure rate resolver — no I/O. Cascade: (1) the channel's own latest row with
 * `effectiveFrom <= at`; (2) fall back to any channel settling the same
 * currency (USD channels fall back to the USD identity, rate = 1); (3) throw
 * `RateNotFoundError`. Never returns 0 or null.
 */
export function resolveRate(
  rates: ExchangeRate[],
  channel: PaymentChannel,
  at: Date,
): ResolvedRate {
  const own = rates.filter((r) => r.channel === channel);
  const ownLatest = latestEffective(own, at);
  if (ownLatest) {
    return { rate: ownLatest.rate, source: ownLatest };
  }
  return resolveRateForCurrency(rates, CHANNEL_CURRENCY[channel], at);
}

/**
 * Same as `resolveRate`, but never throws — returns `undefined` when no rate
 * resolves (channel nor its currency). Used by the same-currency soft-resolve
 * branch: "consult a rate first, else 1x1", never a hard failure.
 */
function tryResolveRate(
  rates: ExchangeRate[],
  channel: PaymentChannel,
  at: Date,
): ResolvedRate | undefined {
  try {
    return resolveRate(rates, channel, at);
  } catch (err) {
    if (err instanceof RateNotFoundError) return undefined;
    throw err;
  }
}

/**
 * Same as `resolveRateForCurrency`, but never throws — returns `undefined`
 * when no rate resolves for that bare currency. Used by
 * `convertBetweenCurrencies`'s same-currency soft-resolve branch (channel-less,
 * so it soft-resolves by currency directly rather than via a channel cascade).
 */
function tryResolveRateForCurrency(
  rates: ExchangeRate[],
  currency: Currency,
  at: Date,
): ResolvedRate | undefined {
  try {
    return resolveRateForCurrency(rates, currency, at);
  } catch (err) {
    if (err instanceof RateNotFoundError) return undefined;
    throw err;
  }
}

/**
 * Fabricates a non-persisted 1x1 identity `ExchangeRate` for the same-currency
 * soft-resolve fallback (`id` absent marks it synthetic — mirrors the USD
 * pivot's fabricated row in `resolveRateForCurrency`; never a fake/fabricated
 * UUID, only an absent one).
 */
function syntheticIdentity(channel: PaymentChannel, at: Date): ExchangeRate {
  return { channel, rate: USD_IDENTITY_RATE, effectiveFrom: at, id: undefined };
}

/**
 * Rounds an exact non-negative bigint rational HALF-UP: round(numerator /
 * denominator). Sale settlement is never negative, so only non-negative
 * operands are supported (per design).
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new InvalidMoneyError(
      'divRoundHalfUp requires a non-negative numerator and a positive denominator',
    );
  }
  return (2n * numerator + denominator) / (2n * denominator);
}

/**
 * Converts `source` through the USD pivot (source -> USD -> target) as ONE
 * exact bigint rational, rounded exactly once via `divRoundHalfUp`. Never
 * rounds intermediate amounts.
 */
export function convert(
  rates: ExchangeRate[],
  source: Money,
  channel: PaymentChannel,
  targetCurrency: Currency,
  at: Date,
): ConversionResult {
  if (CHANNEL_CURRENCY[channel] !== source.currency) {
    throw new InvalidMoneyError(
      `Channel "${channel}" settles in ${CHANNEL_CURRENCY[channel]}, but source is ${source.currency}`,
    );
  }

  // Same-currency: consult a rate first (soft-resolve, never throws), fall
  // back to the synthetic 1x1 identity only when NO rate exists at all. This
  // MUST run before the unconditional `resolveRate` call below, otherwise a
  // same-currency conversion with no rate on file would throw instead of
  // identity (decision #5).
  if (source.currency === targetCurrency) {
    const soft = tryResolveRate(rates, channel, at);
    return { money: source, rateApplied: soft?.source ?? syntheticIdentity(channel, at) };
  }

  const originResolved = resolveRate(rates, channel, at);
  const destResolved = resolveRateForCurrency(rates, targetCurrency, at);

  // Single exact rational: source -> USD -> target, one HALF-UP rounding.
  const numerator =
    source.minorUnits * destResolved.rate * 10n ** BigInt(MONEY_SCALE[targetCurrency]);
  const denominator =
    originResolved.rate * 10n ** BigInt(MONEY_SCALE[source.currency]);
  const targetMinorUnits = divRoundHalfUp(numerator, denominator);

  return {
    money: { minorUnits: targetMinorUnits, currency: targetCurrency },
    rateApplied: destResolved.source,
  };
}

/**
 * Channel-less currency-to-currency conversion — for contexts with no
 * `PaymentChannel` (e.g. `OrderLine` product-native currency -> order
 * currency). Same same-currency/cross-currency rules as `convert`: consults
 * a rate for the bare currency first (soft-resolve), 1x1 identity only when
 * none exists; cross-currency resolves BOTH sides via `resolveRateForCurrency`
 * (raises `RateNotFoundError` when a non-USD rate is missing — never defaults
 * to 1x1) and applies ONE HALF-UP-rounded pivot, stamping the SOURCE-side rate
 * (the rate that priced the foreign line) — decision #6.
 */
export function convertBetweenCurrencies(
  rates: ExchangeRate[],
  source: Money,
  targetCurrency: Currency,
  at: Date,
): ConversionResult {
  if (source.currency === targetCurrency) {
    const soft = tryResolveRateForCurrency(rates, source.currency, at);
    return { money: source, rateApplied: soft?.source ?? syntheticIdentity('ZELLE', at) };
  }

  const originResolved = resolveRateForCurrency(rates, source.currency, at);
  const destResolved = resolveRateForCurrency(rates, targetCurrency, at);

  // Single exact rational: source -> USD -> target, one HALF-UP rounding.
  const numerator =
    source.minorUnits * destResolved.rate * 10n ** BigInt(MONEY_SCALE[targetCurrency]);
  const denominator =
    originResolved.rate * 10n ** BigInt(MONEY_SCALE[source.currency]);
  const targetMinorUnits = divRoundHalfUp(numerator, denominator);

  return {
    money: { minorUnits: targetMinorUnits, currency: targetCurrency },
    rateApplied: originResolved.source,
  };
}
