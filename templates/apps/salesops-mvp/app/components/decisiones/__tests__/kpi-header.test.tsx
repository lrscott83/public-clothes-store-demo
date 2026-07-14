import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiHeader } from '../kpi-header';
import type { KpiHeaderView, KpiTrend } from '../../../domain/decisiones-dashboard';

function trend(current: number, prior: number): KpiTrend {
  const delta = prior === 0 ? null : (current - prior) / prior;
  return { current, prior, delta, trend: delta === null ? 'flat' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
}

const KPIS: KpiHeaderView = {
  ventasUSD: trend(800, 400),
  margenUSD: trend(400, 200),
  margenPercent: 50,
  pedidos: trend(2, 1),
  aovUSD: trend(400, 400),
  comisionPendienteMN: trend(3000, 1000),
};

describe('KpiHeader', () => {
  it('renders exactly 4 StatTiles in the fixed order', () => {
    const { container } = render(<KpiHeader kpis={KPIS} />);
    const labels = [...container.querySelectorAll('p.text-xs')].map((el) => el.textContent);
    expect(labels).toEqual(['Ventas', 'Margen', 'Pedidos', 'Comisión pendiente']);
  });

  it('renders USD figures via formatMoney and the commission figure as plain MN text', () => {
    render(<KpiHeader kpis={KPIS} />);
    expect(screen.getByText('$800.00')).toBeInTheDocument();
    expect(screen.getByText(/^3000 MN$/)).toBeInTheDocument();
    expect(screen.queryByText('$3,000.00')).not.toBeInTheDocument();
  });

  it('shows the margin percent as a sublabel and AOV alongside Pedidos', () => {
    render(<KpiHeader kpis={KPIS} />);
    expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$400\.00/).length).toBeGreaterThan(0);
  });
});
