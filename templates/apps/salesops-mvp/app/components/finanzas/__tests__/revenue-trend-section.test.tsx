import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RevenueTrendSection } from '../revenue-trend-section';
import type { RevenueTrendView } from '../../../domain/finanzas-dashboard';

function buildTrend(): RevenueTrendView {
  const points = [];
  for (let offset = 19; offset >= 0; offset--) {
    points.push({ dayOffset: offset, revenueUSD: 100 + offset });
  }
  return { points };
}

describe('RevenueTrendSection', () => {
  it('renders exactly one svg/polyline for the revenue series', () => {
    const { container } = render(<RevenueTrendSection trend={buildTrend()} />);

    expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    expect(container.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/ventas/i));
  });

  it('renders a help affordance and the "ventas por día" heading', () => {
    render(<RevenueTrendSection trend={buildTrend()} />);

    expect(screen.getByText(/ventas por día/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
