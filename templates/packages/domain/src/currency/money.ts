import { InvalidMoneyError } from './errors.js';

/** The three currencies this module supports. USD is the internal pivot. */
export type Currency = 'USD' | 'EUR' | 'MN';

/**
 * Decimal scale per currency, kept as a map (not a global constant) so a
 * future scale-0 currency is a data change, not a code change.
 */
export const MONEY_SCALE: Record<Currency, number> = {
  USD: 2,
  EUR: 2,
  MN: 2,
};

/**
 * Money value object. `minorUnits` is an exact `bigint` count of the
 * currency's smallest unit (cents for USD/EUR/MN today) — never a float.
 * An amount never exists without its currency attached.
 */
export interface Money {
  readonly minorUnits: bigint;
  readonly currency: Currency;
}

export function money(minorUnits: bigint, currency: Currency): Money {
  return { minorUnits, currency };
}

const DECIMAL_STRING_PATTERN = /^(-?\d+)(?:\.(\d+))?$/;

/**
 * Parses a decimal string ("350.45", "-12.3", "100") into an exact minor-unit
 * `bigint` at the given `scale`. Rejects malformed strings and strings with
 * more fractional digits than the target scale allows.
 */
function parseDecimalToMinorUnits(value: string, scale: number): bigint {
  const match = DECIMAL_STRING_PATTERN.exec(value.trim());
  if (!match) {
    throw new InvalidMoneyError(`Invalid decimal string: "${value}"`);
  }
  const [, intPart, fracPart = ''] = match;
  if (fracPart.length > scale) {
    throw new InvalidMoneyError(
      `Value "${value}" has more than ${scale} decimal place(s)`,
    );
  }
  const paddedFrac = fracPart.padEnd(scale, '0');
  const negative = intPart.startsWith('-');
  const absInt = negative ? intPart.slice(1) : intPart;
  const minorUnits = BigInt(absInt + paddedFrac || '0');
  return negative ? -minorUnits : minorUnits;
}

/** Formats an exact minor-unit `bigint` back into a decimal string at `scale`. */
function formatMinorUnitsToDecimal(minorUnits: bigint, scale: number): string {
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  if (scale === 0) {
    return `${negative ? '-' : ''}${abs.toString()}`;
  }
  const divisor = 10n ** BigInt(scale);
  const intPart = abs / divisor;
  const fracPart = (abs % divisor).toString().padStart(scale, '0');
  return `${negative ? '-' : ''}${intPart.toString()}.${fracPart}`;
}

export function moneyFromDecimalString(value: string, currency: Currency): Money {
  const minorUnits = parseDecimalToMinorUnits(value, MONEY_SCALE[currency]);
  return { minorUnits, currency };
}

export function moneyToDecimalString(amount: Money): string {
  return formatMinorUnitsToDecimal(amount.minorUnits, MONEY_SCALE[amount.currency]);
}

/**
 * Adds two `Money` values. Mixed-currency arithmetic is impossible without an
 * explicit conversion step first — this guard is what makes that structural.
 */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new InvalidMoneyError(
      `Cannot add Money of different currencies directly: ${a.currency} + ${b.currency}. Convert first.`,
    );
  }
  return { minorUnits: a.minorUnits + b.minorUnits, currency: a.currency };
}
