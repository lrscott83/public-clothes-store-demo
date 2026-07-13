import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CashFlowTrendSection } from '../cash-flow-trend-section';
import type { CashFlowTrendView } from '../../../domain/finanzas-dashboard';

function buildTrend(): CashFlowTrendView {
  const points = [];
  for (let offset = 19; offset >= 0; offset--) {
    points.push({ dayOffset: offset, cobradoUSD: 100 + offset, pendienteUSD: 50 + offset });
  }
  return { points };
}

describe('CashFlowTrendSection', () => {
  it('renders exactly one svg/polyline for the cobrado series by default', () => {
    const { container } = render(<CashFlowTrendSection trend={buildTrend()} />);

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/cobrado/i));
  });

  it('toggles to the pendiente series without adding a second chart', async () => {
    const user = userEvent.setup();
    const { container } = render(<CashFlowTrendSection trend={buildTrend()} />);

    await user.click(screen.getByRole('button', { name: /pendiente/i }));

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/pendiente/i));
  });

  it('renders a help affordance and the "20 días" heading', () => {
    render(<CashFlowTrendSection trend={buildTrend()} />);

    expect(screen.getByText(/cobros estimados por estado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
