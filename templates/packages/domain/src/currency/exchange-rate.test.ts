import { describe, it, expect } from 'vitest';
import { RATE_SCALE, rateFromDecimalString, rateToDecimalString } from './exchange-rate.js';

describe('RATE_SCALE', () => {
  it('is 6', () => {
    expect(RATE_SCALE).toBe(6);
  });
});

describe('rateFromDecimalString / rateToDecimalString round-trip', () => {
  it('round-trips "350.455" at scale 6', () => {
    const rate = rateFromDecimalString('350.455');
    expect(rate).toBe(350455000n);
    expect(rateToDecimalString(rate)).toBe('350.455000');
  });

  it('round-trips the USD pivot identity rate "1"', () => {
    const rate = rateFromDecimalString('1');
    expect(rate).toBe(1000000n);
    expect(rateToDecimalString(rate)).toBe('1.000000');
  });

  it('round-trips a rate with all 6 fractional digits', () => {
    const rate = rateFromDecimalString('0.920001');
    expect(rate).toBe(920001n);
    expect(rateToDecimalString(rate)).toBe('0.920001');
  });
});
