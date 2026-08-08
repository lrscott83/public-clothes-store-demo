import { describe, it, expect } from 'vitest';
import {
  MONEY_SCALE,
  money,
  moneyFromDecimalString,
  moneyToDecimalString,
  addMoney,
} from './money.js';
import { InvalidMoneyError } from './errors.js';

describe('MONEY_SCALE', () => {
  it('USD, EUR and MN all use scale 2', () => {
    expect(MONEY_SCALE.USD).toBe(2);
    expect(MONEY_SCALE.EUR).toBe(2);
    expect(MONEY_SCALE.MN).toBe(2);
  });
});

describe('moneyFromDecimalString / moneyToDecimalString round-trip', () => {
  it('round-trips a positive amount', () => {
    const m = moneyFromDecimalString('350.45', 'USD');
    expect(m.minorUnits).toBe(35045n);
    expect(m.currency).toBe('USD');
    expect(moneyToDecimalString(m)).toBe('350.45');
  });

  it('round-trips a negative amount', () => {
    const m = moneyFromDecimalString('-12.30', 'MN');
    expect(m.minorUnits).toBe(-1230n);
    expect(moneyToDecimalString(m)).toBe('-12.30');
  });

  it('round-trips a zero-fraction amount', () => {
    const m = moneyFromDecimalString('100', 'EUR');
    expect(m.minorUnits).toBe(10000n);
    expect(moneyToDecimalString(m)).toBe('100.00');
  });

  it('pads a single decimal digit to the currency scale', () => {
    const m = moneyFromDecimalString('10.5', 'USD');
    expect(m.minorUnits).toBe(1050n);
    expect(moneyToDecimalString(m)).toBe('10.50');
  });
});

describe('scale guard rejects mismatched decimals', () => {
  it('rejects a decimal string with more fractional digits than the currency scale', () => {
    expect(() => moneyFromDecimalString('10.123', 'USD')).toThrow(InvalidMoneyError);
  });

  it('rejects a non-numeric string', () => {
    expect(() => moneyFromDecimalString('abc', 'USD')).toThrow(InvalidMoneyError);
  });
});

describe('mixed-currency arithmetic rejected', () => {
  it('adds two Money of the same currency', () => {
    const a = money(100n, 'USD');
    const b = money(250n, 'USD');
    const sum = addMoney(a, b);
    expect(sum.minorUnits).toBe(350n);
    expect(sum.currency).toBe('USD');
  });

  it('throws InvalidMoneyError when adding EUR to MN directly', () => {
    const eur = money(100n, 'EUR');
    const mn = money(100n, 'MN');
    expect(() => addMoney(eur, mn)).toThrow(InvalidMoneyError);
  });
});
