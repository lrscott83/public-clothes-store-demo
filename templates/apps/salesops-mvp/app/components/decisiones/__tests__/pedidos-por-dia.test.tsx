import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PedidosPorDia } from '../pedidos-por-dia';
import type { PedidosPorDiaView } from '../../../domain/decisiones-dashboard';

function buildView(overrides: Partial<PedidosPorDiaView> = {}): PedidosPorDiaView {
  return {
    windowDays: 7,
    points: [
      { dayOffset: 6, count: 1, valueUSD: 100 },
      { dayOffset: 5, count: 0, valueUSD: 0 },
      { dayOffset: 4, count: 2, valueUSD: 200 },
      { dayOffset: 3, count: 0, valueUSD: 0 },
      { dayOffset: 2, count: 1, valueUSD: 150 },
      { dayOffset: 1, count: 0, valueUSD: 0 },
      { dayOffset: 0, count: 3, valueUSD: 300 },
    ],
    avgCountPerDay: 1,
    avgValuePerDay: 107.14,
    countDeltaPercent: 0.5,
    valueDeltaPercent: -0.2,
    ...overrides,
  };
}

describe('PedidosPorDia', () => {
  it('defaults to the Nº pedidos series and shows the average per day', () => {
    render(<PedidosPorDia pedidos={buildView()} />);

    expect(screen.getByText(/1\.0/)).toBeInTheDocument();
  });

  it('toggles to Valor de venta and shows the formatted average', () => {
    render(<PedidosPorDia pedidos={buildView()} />);

    fireEvent.click(screen.getByText('Valor de venta'));

    expect(screen.getByText(/\$107/)).toBeInTheDocument();
  });

  it('shows an up delta for a positive countDeltaPercent', () => {
    render(<PedidosPorDia pedidos={buildView({ countDeltaPercent: 0.5 })} />);

    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
  });

  it('shows a down delta for a negative countDeltaPercent', () => {
    render(<PedidosPorDia pedidos={buildView({ countDeltaPercent: -0.3 })} />);

    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('shows a safe "up" guard (never a raw percent) when countDeltaPercent is null and the current average is positive', () => {
    render(<PedidosPorDia pedidos={buildView({ countDeltaPercent: null, avgCountPerDay: 2 })} />);

    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText(/nuevo/i)).toBeInTheDocument();
  });

  it('shows a flat guard when countDeltaPercent is null and the current average is 0', () => {
    render(<PedidosPorDia pedidos={buildView({ countDeltaPercent: null, avgCountPerDay: 0 })} />);

    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<PedidosPorDia pedidos={buildView()} />);

    expect(screen.getByText('Pedidos por día').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
