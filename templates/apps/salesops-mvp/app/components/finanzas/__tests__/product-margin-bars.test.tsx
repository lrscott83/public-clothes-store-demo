import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductMarginBars } from '../product-margin-bars';
import type { ProductMarginView } from '../../../domain/finanzas-dashboard';

const PRODUCT_MARGIN: ProductMarginView = {
  rows: [
    { productId: 'p1', name: 'Camiseta', marginUSD: 50 },
    { productId: 'p2', name: 'Pantalón', marginUSD: 20 },
  ],
};

describe('ProductMarginBars', () => {
  it('renders one bar per ranked product with margin via formatMoney, sorted desc', () => {
    const { container } = render(<ProductMarginBars productMargin={PRODUCT_MARGIN} />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByText('Camiseta')).toBeInTheDocument();
    expect(screen.getByText('Pantalón')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('has no "finanzas" in the heading', () => {
    render(<ProductMarginBars productMargin={PRODUCT_MARGIN} />);
    expect(screen.getByText('Top productos por margen').textContent?.toLowerCase()).not.toContain('finanzas');
  });

  it('renders nothing for an empty view', () => {
    const { container } = render(<ProductMarginBars productMargin={{ rows: [] }} />);
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });

  it('caps the chart at the top 8 products even when the domain view has more', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`,
      name: `Producto ${i}`,
      marginUSD: 100 - i,
    }));
    const { container } = render(<ProductMarginBars productMargin={{ rows }} />);
    expect(container.querySelectorAll('rect')).toHaveLength(8);
    expect(screen.getByText('Producto 0')).toBeInTheDocument();
    expect(screen.queryByText('Producto 8')).not.toBeInTheDocument();
  });

  it('truncates a very long product name so it does not overrun the bar', () => {
    const rows = [{ productId: 'p1', name: 'Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk', marginUSD: 100 }];
    render(<ProductMarginBars productMargin={{ rows }} />);
    expect(screen.queryByText('Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk')).not.toBeInTheDocument();
    expect(screen.getByText(/^Kit 5\.12KW.*…$/)).toBeInTheDocument();
  });

  it('renders a help affordance', () => {
    render(<ProductMarginBars productMargin={PRODUCT_MARGIN} />);
    expect(screen.getByRole('button', { name: /qué significa/i })).toBeInTheDocument();
  });
});
