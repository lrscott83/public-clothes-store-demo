import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateBreakdownTable } from '../state-breakdown-table';
import type { FinanceStateRow } from '../../../domain/finanzas';

function buildRows(overrides: Partial<FinanceStateRow>[] = []): FinanceStateRow[] {
  const base: FinanceStateRow[] = [
    { state: 'creado', label: 'Creado', count: 1, revenueUSD: 80, commissionMN: 0 },
    { state: 'verificado', label: 'Verificado', count: 0, revenueUSD: 0, commissionMN: 0 },
    { state: 'transportando', label: 'Transportando', count: 0, revenueUSD: 0, commissionMN: 0 },
    { state: 'entregado', label: 'Entregado', count: 2, revenueUSD: 250, commissionMN: 30 },
    { state: 'comision_pagada', label: 'Comisión pagada', count: 1, revenueUSD: 500, commissionMN: 3000 },
  ];
  return base.map((row, i) => ({ ...row, ...overrides[i] }));
}

describe('StateBreakdownTable', () => {
  it('renders exactly 5 rows in order with USD revenue via formatMoney', () => {
    render(<StateBreakdownTable rows={buildRows()} />);

    const table = screen.getByRole('table');
    const bodyRows = table.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(5);

    expect(screen.getByText('$80.00')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();

    const heading = screen.getByText('Flujo por estado');
    expect(heading.textContent?.toLowerCase()).not.toContain('finanzas');
  });

  it('renders non-creado commission cells as plain MN text and the creado cell as "—"', () => {
    render(<StateBreakdownTable rows={buildRows()} />);

    expect(screen.getByText('30 MN')).toBeInTheDocument();
    expect(screen.getByText('3000 MN')).toBeInTheDocument();

    const creadoRow = screen.getByText('Creado').closest('tr')!;
    const creadoCommissionCell = creadoRow.querySelectorAll('td')[3];
    expect(creadoCommissionCell.textContent).toBe('—');
    expect(creadoCommissionCell.textContent).not.toMatch(/\$/);
  });

  it('renders a zero-count row without throwing, Pedidos cell shows 0 and revenue matches $0.00', () => {
    render(<StateBreakdownTable rows={buildRows()} />);

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(2); // verificado + transportando Pedidos cells
    expect(screen.getAllByText('$0.00')).toHaveLength(2);
  });
});
