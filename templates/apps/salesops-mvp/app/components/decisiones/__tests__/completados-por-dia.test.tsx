import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompletadosPorDia } from '../completados-por-dia';
import type { CompletadosPorDiaView } from '../../../domain/decisiones-dashboard';

function buildView(overrides: Partial<CompletadosPorDiaView> = {}): CompletadosPorDiaView {
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
    tasaCompletado: 0.75,
    ...overrides,
  };
}

describe('CompletadosPorDia', () => {
  it('shows tasa de completado as a percentage', () => {
    render(<CompletadosPorDia completados={buildView({ tasaCompletado: 0.75 })} />);

    expect(screen.getByText(/75%/)).toBeInTheDocument();
  });

  it('renders a safe 0% tasa de completado without throwing', () => {
    render(<CompletadosPorDia completados={buildView({ tasaCompletado: 0, countDeltaPercent: null })} />);

    expect(screen.getByText(/\b0%/)).toBeInTheDocument();
  });

  it('defaults to the Nº pedidos series and shows the average per day', () => {
    render(<CompletadosPorDia completados={buildView()} />);

    expect(screen.getByText(/1\.0/)).toBeInTheDocument();
  });

  it('toggles to Valor de venta and shows the formatted average', () => {
    render(<CompletadosPorDia completados={buildView()} />);

    fireEvent.click(screen.getByText('Valor de venta'));

    expect(screen.getByText(/\$107/)).toBeInTheDocument();
  });

  it('shows an up delta for a positive countDeltaPercent while on the Nº series', () => {
    render(<CompletadosPorDia completados={buildView({ countDeltaPercent: 0.5 })} />);

    expect(screen.getByText('▲')).toBeInTheDocument();
  });

  it('shows a safe "up" guard when countDeltaPercent is null and the current average is positive', () => {
    render(<CompletadosPorDia completados={buildView({ countDeltaPercent: null, avgCountPerDay: 2 })} />);

    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText(/nuevo/i)).toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<CompletadosPorDia completados={buildView()} />);

    expect(screen.getByText('Completados por día').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});
