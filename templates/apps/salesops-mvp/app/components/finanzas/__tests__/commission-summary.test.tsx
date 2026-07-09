import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommissionSummary } from '../commission-summary';
import type { FinanceKpis } from '../../../domain/finanzas';

function buildKpis(overrides: Partial<FinanceKpis> = {}): FinanceKpis {
  return {
    commissionPaidMN: 3000,
    commissionPendingMN: 1500,
    commissionTotalMN: 4500,
    pendingPaymentCount: 2,
    ...overrides,
  };
}

describe('CommissionSummary', () => {
  it('renders each commission KPI as plain "{value} MN" text and the pending count as a plain number', () => {
    render(<CommissionSummary kpis={buildKpis()} />);

    expect(screen.getByText('3000 MN')).toBeInTheDocument();
    expect(screen.getByText('1500 MN')).toBeInTheDocument();
    expect(screen.getByText('4500 MN')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();

    const headings = screen.getAllByRole('heading');
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      expect(heading.textContent?.toLowerCase()).not.toContain('finanzas');
    }
  });

  it('never renders a commission figure through the formatMoney USD pattern', () => {
    const { container } = render(<CommissionSummary kpis={buildKpis()} />);

    expect(container.textContent).not.toMatch(/\$[\d,]+\.\d{2}/);
    expect(screen.queryAllByText(/^\$[\d,]+\.\d{2}$/)).toHaveLength(0);
  });
});
