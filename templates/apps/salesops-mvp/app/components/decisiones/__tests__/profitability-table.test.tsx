import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProfitabilityTable } from '../profitability-table';
import type { ProfitabilityRow } from '../../../domain/decisiones';

function buildRow(overrides: Partial<ProfitabilityRow> = {}): ProfitabilityRow {
  return {
    orderId: 'order-1',
    label: 'Cliente 1',
    revenueUSD: 500,
    costUSD: 200,
    commissionUSD: 75,
    marginUSD: 225,
    marginPercent: 45,
    isLoss: false,
    ...overrides,
  };
}

describe('ProfitabilityTable', () => {
  it('renders one row per input row, each money cell matching the formatMoney pattern, no "decisiones" heading', () => {
    const rows = [buildRow({ orderId: 'order-1' }), buildRow({ orderId: 'order-2', label: 'Cliente 2' })];
    render(<ProfitabilityTable rows={rows} />);

    expect(screen.getByText('Cliente 1')).toBeInTheDocument();
    expect(screen.getByText('Cliente 2')).toBeInTheDocument();
    const moneyStrings = screen.getAllByText(/^-?\$[\d,]+\.\d{2}$/);
    expect(moneyStrings.length).toBeGreaterThan(0);

    const headings = screen.getAllByRole('heading');
    for (const heading of headings) {
      expect(heading.textContent?.toLowerCase()).not.toContain('decisiones');
    }
  });

  it('renders an inline "Pérdida" tag when isLoss is true, and no tag when isLoss is false', () => {
    const rows = [
      buildRow({ orderId: 'order-loss', isLoss: true, marginUSD: -20 }),
      buildRow({ orderId: 'order-profit', isLoss: false }),
    ];
    render(<ProfitabilityTable rows={rows} />);

    const tags = screen.getAllByText(/pérdida/i);
    expect(tags).toHaveLength(1);
  });

  it('renders the table shell without throwing when rows is empty', () => {
    expect(() => render(<ProfitabilityTable rows={[]} />)).not.toThrow();
  });
});
