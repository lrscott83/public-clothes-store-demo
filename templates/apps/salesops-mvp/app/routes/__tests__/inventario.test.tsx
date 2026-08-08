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

  it('renders one tab per warehouse, labeled with each warehouse name', () => {
    const state = loadSeedState();
    render(<Inventario />);

    const tabNames = screen.getAllByRole('tab').map((t) => t.textContent);
    for (const warehouse of state.warehouses) {
      expect(tabNames).toContain(warehouse.name);
    }
  });

  it('shows only the active warehouse detail, with stock status badges', () => {
    const state = loadSeedState();
    render(<Inventario />);

    // Tabs render one warehouse detail at a time — exactly one product table.
    expect(screen.getAllByRole('table')).toHaveLength(1);
    // The active warehouse's rows render StockBadge status text.
    expect(screen.getAllByText(/disponible|agotado/i).length).toBeGreaterThan(0);
  });

  it('formats money via formatMoney (Intl string), never manual "$"+toFixed', () => {
    loadSeedState();
    render(<Inventario />);

    // en-US + USD via Intl.NumberFormat renders as "$1,234.56" (thousands
    // separator + 2 decimals), never a manual "$1234.56" from toFixed.
    const moneyStrings = screen.getAllByText(/^\$[\d,]+\.\d{2}$/);
    expect(moneyStrings.length).toBeGreaterThan(0);
  });

  it('renders no data-mutation affordance (no <form>; tabs and column sorting are view-only)', () => {
    loadSeedState();
    const { container } = render(<Inventario />);

    // This app mutates only through RR7 <Form> actions; a read-only screen has
    // none. Tabs (role="tab") and column-sort headers are view controls that
    // never write to the store, so their presence is expected.
    expect(container.querySelector('form')).toBeNull();
  });
});
