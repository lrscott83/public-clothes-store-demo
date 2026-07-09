import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfitabilitySummary } from '../profitability-summary';
import type { ProfitabilityTotals } from '../../../domain/decisiones';

function buildTotals(overrides: Partial<ProfitabilityTotals> = {}): ProfitabilityTotals {
  return {
    revenueUSD: 500,
    costUSD: 200,
    commissionUSD: 75,
    marginUSD: 225,
    ...overrides,
  };
}

describe('ProfitabilitySummary', () => {
  it('renders revenue/cost/commission/margin figures via formatMoney and no "decisiones" heading', () => {
    render(<ProfitabilitySummary totals={buildTotals()} count={3} />);

    // formatMoney(value, { locale: 'en-US', currency: 'USD' }) -> Intl "$X.XX"
    const moneyStrings = screen.getAllByText(/^\$[\d,]+\.\d{2}$/);
    expect(moneyStrings.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$225.00')).toBeInTheDocument();

    const headings = screen.getAllByRole('heading');
    for (const heading of headings) {
      expect(heading.textContent?.toLowerCase()).not.toContain('decisiones');
    }
  });

  it('renders a visible loss emphasis on the grand-total margin figure when marginUSD < 0', () => {
    render(<ProfitabilitySummary totals={buildTotals({ marginUSD: -20 })} count={2} />);

    const marginFigure = screen.getByText('-$20.00');
    expect(marginFigure.className).toMatch(/red|loss|rose|danger/i);
  });
});
