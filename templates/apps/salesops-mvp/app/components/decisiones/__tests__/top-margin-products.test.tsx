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
});
