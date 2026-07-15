import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FinanceKpiHeader } from '../finance-kpi-header';
import type { FinanceKpiHeaderView } from '../../../domain/finanzas-dashboard';

function buildKpis(overrides: Partial<FinanceKpiHeaderView> = {}): FinanceKpiHeaderView {
  return {
    ingresosFacturadosUSD: { current: 800, prior: 400, delta: 1, trend: 'up' },
    ingresosLiquidadosMN: { current: 32000, prior: 16000, delta: 1, trend: 'up' },
    comisionPendienteMN: { current: 3000, prior: 1000, delta: 2, trend: 'up' },
    margenNetoUSD: { current: 225, prior: 100, delta: 1.25, trend: 'up' },
    margenPercent: 45,
    aovUSD: { current: 400, prior: 400, delta: 0, trend: 'flat' },
    ...overrides,
  };
}

describe('FinanceKpiHeader', () => {
  it('renders all 5 tiles with their formatted values, Ticket promedio last', () => {
    render(<FinanceKpiHeader kpis={buildKpis()} />);

    expect(screen.getByText('Ingresos facturados')).toBeInTheDocument();
    expect(screen.getByText('$800.00')).toBeInTheDocument();

    expect(screen.getByText('Ingresos liquidados')).toBeInTheDocument();
    expect(screen.getByText('32000 MN')).toBeInTheDocument();

    expect(screen.getByText('Comisión pendiente')).toBeInTheDocument();
    expect(screen.getByText('3000 MN')).toBeInTheDocument();

    expect(screen.getByText('Margen neto')).toBeInTheDocument();
    expect(screen.getByText('$225.00')).toBeInTheDocument();
    expect(screen.getByText('45.0%')).toBeInTheDocument();

    expect(screen.getByText('Ticket promedio')).toBeInTheDocument();
    expect(screen.getByText('$400.00')).toBeInTheDocument();
  });

  it('renders an InfoPopover help button for each tile', () => {
    render(<FinanceKpiHeader kpis={buildKpis()} />);

    expect(screen.getAllByRole('button', { name: /qué significa/i }).length).toBe(5);
  });

  // On desktop the 5 KPIs must sit in a single row — a 4-column grid orphaned
  // the 5th tile onto a second row. Desktop breakpoint fits all 5 across.
  it('lays the 5 tiles out in a single row on desktop (5-column grid)', () => {
    const { container } = render(<FinanceKpiHeader kpis={buildKpis()} />);

    const section = container.querySelector('section');
    expect(section?.className).toContain('lg:grid-cols-5');
  });
});
