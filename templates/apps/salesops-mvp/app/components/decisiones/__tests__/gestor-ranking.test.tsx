import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GestorRanking } from '../gestor-ranking';
import type { GestorRankingView } from '../../../domain/decisiones-dashboard';

const RANKING: GestorRankingView = {
  rows: [
    {
      gestorId: 'g1',
      name: 'Ana',
      revenueUSD: 400,
      count: 1,
      aovUSD: 400,
      commissionEarnedMN: 800,
      commissionPendingMN: 800,
    },
    { gestorId: 'g2', name: 'Beto', revenueUSD: 0, count: 0, aovUSD: 0, commissionEarnedMN: 0, commissionPendingMN: 0 },
  ],
};

describe('GestorRanking', () => {
  it('renders one row per gestor with revenueUSD/aov via formatMoney and MN commissions as plain text', () => {
    render(<GestorRanking gestores={RANKING} period="general" onPeriodChange={vi.fn()} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Beto')).toBeInTheDocument();
    expect(screen.getAllByText('$400.00').length).toBeGreaterThanOrEqual(2); // revenue + aov
    expect(screen.getAllByText(/^800 MN$/).length).toBe(2); // earned + pending
    expect(screen.queryByText('$800.00')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<GestorRanking gestores={RANKING} period="general" onPeriodChange={vi.fn()} />);
    expect(screen.getByText('Ranking de gestores').textContent?.toLowerCase()).not.toContain('decisiones');
  });

  it('renders the [7d/30d/General] period selector with the current value pressed', () => {
    render(<GestorRanking gestores={RANKING} period={7} onPeriodChange={vi.fn()} />);
    expect(screen.getByText('7d')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('30d')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('General')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onPeriodChange with 7, 30, or "general" when each option is clicked', () => {
    const onPeriodChange = vi.fn();
    render(<GestorRanking gestores={RANKING} period="general" onPeriodChange={onPeriodChange} />);

    fireEvent.click(screen.getByText('7d'));
    fireEvent.click(screen.getByText('30d'));
    fireEvent.click(screen.getByText('General'));

    expect(onPeriodChange).toHaveBeenNthCalledWith(1, 7);
    expect(onPeriodChange).toHaveBeenNthCalledWith(2, 30);
    expect(onPeriodChange).toHaveBeenNthCalledWith(3, 'general');
  });
});
