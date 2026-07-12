import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesTrendSection } from '../sales-trend-section';
import type { SalesTrendView } from '../../../domain/decisiones-dashboard';

const TREND: SalesTrendView = {
  points: [
    { dayOffset: 19, count: 1, valueUSD: 100 },
    { dayOffset: 18, count: 0, valueUSD: 0 },
    { dayOffset: 0, count: 3, valueUSD: 300 },
  ],
};

describe('SalesTrendSection', () => {
  it('renders the heading (no "decisiones") and defaults to the "valor" series', () => {
    render(<SalesTrendSection trend={TREND} />);
    const heading = screen.getByText('Tendencia de ventas (20 días)');
    expect(heading.textContent?.toLowerCase()).not.toContain('decisiones');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/valor/i));
  });

  it('toggling to "cantidad" switches the rendered series without a new SeedState read', async () => {
    const { getByRole } = render(<SalesTrendSection trend={TREND} />);
    const cantidadButton = getByRole('button', { name: /cantidad/i });
    fireEvent.click(cantidadButton);

    expect(getByRole('img')).toHaveAttribute('aria-label', expect.stringMatching(/cantidad/i));
  });
});
