import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CurrencyExposureDonut } from '../currency-exposure-donut';
import type { CurrencyExposureView } from '../../../domain/finanzas-dashboard';

function buildView(): CurrencyExposureView {
  return {
    slices: [
      { method: 'USD', revenueUSD: 400, percent: 50, isHardCurrency: true },
      { method: 'MN', revenueUSD: 400, percent: 50, isHardCurrency: false },
    ],
  };
}

describe('CurrencyExposureDonut', () => {
  it('renders one donut slice per currency bucket with its label', () => {
    const { container } = render(<CurrencyExposureDonut currencyExposure={buildView()} />);

    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelectorAll('circle[data-slice]')).toHaveLength(2);
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('MN')).toBeInTheDocument();
  });

  it('renders a help affordance and the "Mix por moneda" heading', () => {
    render(<CurrencyExposureDonut currencyExposure={buildView()} />);

    expect(screen.getByText('Mix por moneda')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
