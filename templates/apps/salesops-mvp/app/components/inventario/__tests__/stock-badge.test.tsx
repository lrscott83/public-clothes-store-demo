import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StockBadge } from '../stock-badge';

describe('StockBadge', () => {
  it('renders "Disponible" with emerald classes for status="disponible"', () => {
    render(<StockBadge status="disponible" />);

    const badge = screen.getByText('Disponible');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/emerald/);
  });

  it('renders "Agotado" with red classes for status="agotado"', () => {
    render(<StockBadge status="agotado" />);

    const badge = screen.getByText('Agotado');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toMatch(/red/);
  });
});
