import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GestorCommissionTable } from '../gestor-commission-table';
import type { GestorCommissionCostView } from '../../../domain/finanzas-dashboard';

function buildView(): GestorCommissionCostView {
  return {
    rows: [
      {
        gestorId: 'g1',
        name: 'Gestor Uno',
        revenueUSD: 400,
        commissionEarnedMN: 800,
        commissionPendingMN: 200,
        commissionPaidMN: 600,
        takeRatePercent: 5,
        roi: 20,
      },
      {
        gestorId: 'g2',
        name: 'Gestor Dos',
        revenueUSD: 0,
        commissionEarnedMN: 0,
        commissionPendingMN: 0,
        commissionPaidMN: 0,
        takeRatePercent: 0,
        roi: 0,
      },
    ],
  };
}

describe('GestorCommissionTable', () => {
  it('renders one row per gestor with ingreso/pagada/pendiente/take-rate/ROI columns (no redundant devengada)', () => {
    render(<GestorCommissionTable gestorCommission={buildView()} />);

    const table = screen.getByRole('table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);

    // devengada = pagada + pendiente, so it is omitted to keep the table readable
    expect(table.querySelectorAll('thead th')).toHaveLength(6);
    expect(screen.queryByText('800 MN')).not.toBeInTheDocument();

    expect(screen.getByText('Gestor Uno')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
    expect(screen.getByText('600 MN')).toBeInTheDocument();
    expect(screen.getByText('200 MN')).toBeInTheDocument();
    expect(screen.getByText('5.0%')).toBeInTheDocument();
    expect(screen.getByText('20.0x')).toBeInTheDocument();
  });

  it('a zero-order gestor still appears at 0, not omitted', () => {
    render(<GestorCommissionTable gestorCommission={buildView()} />);

    expect(screen.getByText('Gestor Dos')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders a help affordance and heading', () => {
    render(<GestorCommissionTable gestorCommission={buildView()} />);

    expect(screen.getByText('Comisión y ROI por gestor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
