import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurrencyMix } from '../currency-mix';
import type { CurrencyMixView } from '../../../domain/decisiones-dashboard';

const MIX: CurrencyMixView = {
  buckets: [
    { method: 'USD', count: 4, revenueUSD: 400, percent: 40 },
    { method: 'MN', count: 3, revenueUSD: 300, percent: 30 },
    { method: 'otros', count: 3, revenueUSD: 300, percent: 30 },
  ],
};

describe('CurrencyMix', () => {
  it('renders one slice per method via DonutChart with legend percentages', () => {
    const { container } = render(<CurrencyMix currencyMix={MIX} />);
    expect(container.querySelectorAll('circle[data-slice]')).toHaveLength(3);
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('otros')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<CurrencyMix currencyMix={MIX} />);
    expect(screen.getByText('Mix por moneda').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
