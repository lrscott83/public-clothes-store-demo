import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TopMarginProducts } from '../top-margin-products';
import type { TopMarginView } from '../../../domain/decisiones-dashboard';

const TOP_MARGIN: TopMarginView = {
  rows: [
    { productId: 'p1', name: 'Camiseta', marginUSD: 50 },
    { productId: 'p2', name: 'Pantalón', marginUSD: 20 },
  ],
};

describe('TopMarginProducts', () => {
  it('renders one bar per ranked product with margin via formatMoney, sorted desc', () => {
    const { container } = render(<TopMarginProducts topMargin={TOP_MARGIN} />);
    expect(container.querySelectorAll('rect')).toHaveLength(2);
    expect(screen.getByText('Camiseta')).toBeInTheDocument();
    expect(screen.getByText('Pantalón')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<TopMarginProducts topMargin={TOP_MARGIN} />);
    expect(screen.getByText('Top productos por margen').textContent?.toLowerCase()).not.toContain('decisiones');
  });

  it('does not render an unsold product (absent from the domain view already)', () => {
    render(<TopMarginProducts topMargin={{ rows: [] }} />);
    expect(screen.queryByText('Camiseta')).not.toBeInTheDocument();
  });

  it('caps the chart at the top 8 products even when the domain view has more', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`,
      name: `Producto ${i}`,
      marginUSD: 100 - i,
    }));
    const { container } = render(<TopMarginProducts topMargin={{ rows }} />);
    expect(container.querySelectorAll('rect')).toHaveLength(8);
    // highest-margin product is kept, a beyond-top-8 product is dropped
    expect(screen.getByText('Producto 0')).toBeInTheDocument();
    expect(screen.queryByText('Producto 8')).not.toBeInTheDocument();
  });

  it('truncates a very long product name so it does not overrun the bar', () => {
    const rows = [{ productId: 'p1', name: 'Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk', marginUSD: 100 }];
    render(<TopMarginProducts topMargin={{ rows }} />);
    expect(screen.queryByText('Kit 5.12KW: Inversor MUST 3KW + Batería Humsienk')).not.toBeInTheDocument();
    expect(screen.getByText(/^Kit 5\.12KW.*…$/)).toBeInTheDocument();
  });
});
