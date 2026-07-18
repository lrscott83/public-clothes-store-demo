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
 * channel cascade and directly for the destination side of `convertir`, which
 * only knows a target currency, not a target channel).
 */
function resolveRateForCurrency(
  rates: ExchangeRate[],
  currency: Currency,
  at: Date,
): ResolvedRate {
  if (currency === 'USD') {
    return {
      rate: USD_IDENTITY_RATE,
      source: { channel: 'ZELLE', rate: USD_IDENTITY_RATE, effectiveFrom: at },
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
export function resolverTasa(
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
 * Converts `origen` through the USD pivot (origen -> USD -> destino) as ONE
 * exact bigint rational, rounded exactly once via `divRoundHalfUp`. Never
 * rounds intermediate amounts.
 */
export function convertir(
  rates: ExchangeRate[],
  origen: Money,
  channel: PaymentChannel,
  monedaDestino: Currency,
  at: Date,
): ConversionResult {
  if (CHANNEL_CURRENCY[channel] !== origen.currency) {
    throw new InvalidMoneyError(
      `Channel "${channel}" settles in ${CHANNEL_CURRENCY[channel]}, but origen is ${origen.currency}`,
    );
  }

  const originResolved = resolverTasa(rates, channel, at);

  if (origen.currency === monedaDestino) {
    return { money: origen, rateApplied: originResolved.source };
  }

  const destResolved = resolveRateForCurrency(rates, monedaDestino, at);

  // Single exact rational: origen -> USD -> destino, one HALF-UP rounding.
  const numerator =
    origen.minorUnits * destResolved.rate * 10n ** BigInt(MONEY_SCALE[monedaDestino]);
  const denominator =
    originResolved.rate * 10n ** BigInt(MONEY_SCALE[origen.currency]);
  const destinoMinorUnits = divRoundHalfUp(numerator, denominator);

  return {
    money: { minorUnits: destinoMinorUnits, currency: monedaDestino },
    rateApplied: destResolved.source,
  };
}
