import { describe, it, expect } from 'vitest';
import { formatPercentBadge } from './badges';

describe('formatPercentBadge', () => {
  it('renders a whole-number percent without decimals', () => {
    expect(formatPercentBadge('20.00')).toBe('-20%');
  });

  it('renders a fractional percent trimmed of trailing zeros', () => {
    expect(formatPercentBadge('12.50')).toBe('-12.5%');
  });

  it('renders "10" (the example from the phase brief) as -10%', () => {
    expect(formatPercentBadge('10.00')).toBe('-10%');
  });
});
