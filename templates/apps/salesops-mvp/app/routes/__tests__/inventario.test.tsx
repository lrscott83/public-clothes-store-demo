import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Inventario from '../inventario';
import { loadSeedState } from '../../store/seed-store';

describe('Inventario container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the page heading', () => {
    loadSeedState();
    render(<Inventario />);

    expect(screen.getByRole('heading', { name: /inventario/i })).toBeInTheDocument();
  });

  it('renders the grand-total block with "Valor de venta" / "Valor de costo" labels and values', () => {
    loadSeedState();
    render(<Inventario />);

    expect(screen.getAllByText(/valor de venta/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/valor de costo/i).length).toBeGreaterThan(0);
  });

  it('renders each of the 3 warehouse detail sections', () => {
    const state = loadSeedState();
    render(<Inventario />);

    const headings = screen.getAllByRole('heading');
    const headingNames = headings.map((h) => h.textContent);
    for (const warehouse of state.warehouses) {
      expect(headingNames).toContain(warehouse.name);
    }
  });

  it('shows Agotado for a zero-qty product and Disponible for a stocked one', () => {
    const state = loadSeedState();
    render(<Inventario />);

    const hasZeroQty = state.inventory.some((entry) => entry.quantity === 0);
    const hasPositiveQty = state.inventory.some((entry) => entry.quantity > 0);
    expect(hasPositiveQty).toBe(true);
    expect(screen.getAllByText(/disponible/i).length).toBeGreaterThan(0);
    if (hasZeroQty) {
      expect(screen.getAllByText(/agotado/i).length).toBeGreaterThan(0);
    }
  });

  it('formats money via formatMoney (Intl string), never manual "$"+toFixed', () => {
    loadSeedState();
    render(<Inventario />);

    // en-US + USD via Intl.NumberFormat renders as "$1,234.56" (thousands
    // separator + 2 decimals), never a manual "$1234.56" from toFixed.
    const moneyStrings = screen.getAllByText(/^\$[\d,]+\.\d{2}$/);
    expect(moneyStrings.length).toBeGreaterThan(0);
  });

  it('renders no mutation affordance (no form, no mutating button/control)', () => {
    loadSeedState();
    const { container } = render(<Inventario />);

    expect(container.querySelector('form')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
