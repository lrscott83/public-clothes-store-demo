import type { PaymentChannel } from './payment-channel.js';
import { InvalidMoneyError } from './errors.js';

/**
 * Scale for stored rates. The design's example rate "350.455" has 3 decimals;
 * 6 gives headroom for pivot round-trips without widening later.
 */
export const RATE_SCALE = 6;

/**
 * An append-only exchange-rate row. `rate` is a `bigint` scaled by
 * `RATE_SCALE`, expressed as currency-per-USD (i.e. `rate = X` means
 * "1 USD = X units of this channel's settlement currency"). USD is always
 * the pivot — rates are never stored against MN or EUR directly.
 */
export interface ExchangeRate {
  readonly channel: PaymentChannel;
  readonly rate: bigint;
  readonly effectiveFrom: Date;
}

const RATE_DECIMAL_PATTERN = /^(-?\d+)(?:\.(\d+))?$/;

export function rateFromDecimalString(value: string): bigint {
  const match = RATE_DECIMAL_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidMoneyError(`Invalid rate decimal string: "${value}"`);
  }
  const [, intPart, fracPart = ''] = match;
  if (fracPart.length > RATE_SCALE) {
    throw new InvalidMoneyError(
      `Rate "${value}" has more than ${RATE_SCALE} decimal place(s)`,
    );
  }
  const paddedFrac = fracPart.padEnd(RATE_SCALE, '0');
  const negative = intPart.startsWith('-');
  const absInt = negative ? intPart.slice(1) : intPart;
  const scaled = BigInt(absInt + paddedFrac || '0');
  return negative ? -scaled : scaled;
}

export function rateToDecimalString(rate: bigint): string {
  const negative = rate < 0n;
  const abs = negative ? -rate : rate;
  const divisor = 10n ** BigInt(RATE_SCALE);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(RATE_SCALE, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}
