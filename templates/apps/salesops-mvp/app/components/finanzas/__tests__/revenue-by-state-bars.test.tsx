import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RevenueByStateBars } from '../revenue-by-state-bars';
import type { RevenueByStateView } from '../../../domain/finanzas-dashboard';

function buildView(): RevenueByStateView {
  return {
    rows: [
      { state: 'creado', label: 'Creado', count: 0, revenueUSD: 0, commissionMN: 0 },
      { state: 'verificado', label: 'Verificado', count: 1, revenueUSD: 200, commissionMN: 100 },
      { state: 'transportando', label: 'Transportando', count: 0, revenueUSD: 0, commissionMN: 0 },
      { state: 'entregado', label: 'Entregado', count: 1, revenueUSD: 300, commissionMN: 150 },
      { state: 'comision_pagada', label: 'Comisión pagada', count: 0, revenueUSD: 0, commissionMN: 0 },
    ],
  };
}

describe('RevenueByStateBars', () => {
  it('renders one bar per state row, including zero-revenue states', () => {
    const { container } = render(<RevenueByStateBars revenueByState={buildView()} />);

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('rect')).toHaveLength(5);
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
  });

  it('renders a help affordance and heading', () => {
    render(<RevenueByStateBars revenueByState={buildView()} />);

    expect(screen.getByText('Ingresos por estado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
