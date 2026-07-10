import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Order } from '../../domain/types';
import { loadSeedState, saveSeedState } from '../../store/seed-store';
import { GESTORES } from '../../seed/constants';
import OperadorGestores from '../operador-gestores';

const GESTOR_1 = GESTORES.find((g) => g.id === 'gestor-1')!;
const GESTOR_2 = GESTORES.find((g) => g.id === 'gestor-2')!;

/** Initialize seed state then replace orders with only our test data. */
function setupStore(orders: Order[]) {
  localStorage.clear();
  loadSeedState(); // initializes fresh seed data
  const state = loadSeedState();
  state.orders = orders;
  saveSeedState(state);
}

function buildGestorOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-test-1',
    state: 'creado',
    gestorId: 'gestor-1',
    warehouseId: 'warehouse-1',
    client: { id: 'client-1', name: 'Juan Pérez', phone: '+53 5555 0100', address: 'Calle 123' },
    payment: { method: 'USD' },
    items: [{ productId: 'prod-1', quantity: 2, priceUSD: 25, commissionMN: 0 }],
    totalUSD: 50,
    exchangeRateSnapshot: { usdToMn: 680 },
    totalMN: 34000,
    commissionMN: 500,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

function buildEntregadoOrder(overrides: Partial<Order> = {}): Order {
  return buildGestorOrder({ state: 'entregado', commissionMN: 500, ...overrides });
}

describe('OperadorGestores — card rendering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the heading', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);
    expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
  });

  it('shows 5 state columns', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    // h1 + 5 column h3 = 6
    expect(screen.getAllByRole('heading').length).toBe(6);
  });

  it('shows gestor name on the card', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);
    expect(screen.getByText(GESTOR_1.name)).toBeInTheDocument();
  });

  it('shows gestor phone with WhatsApp link', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    const link = screen.getByRole('link', { name: (name) => name.includes(GESTOR_1.phone!) });
    expect(link).toHaveAttribute('href', `https://wa.me/${GESTOR_1.phone!.replace(/\D/g, '')}`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows client name on the card', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });

  it('shows total USD and MN on the card', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('34,000 Mn')).toBeInTheDocument();
  });

  it('does NOT show order ID on the card', () => {
    setupStore([buildGestorOrder({ id: 'secret-order-xyz' })]);
    render(<OperadorGestores />);
    expect(screen.queryByText('secret-order-xyz')).not.toBeInTheDocument();
  });

  it('shows state badge label', () => {
    setupStore([buildGestorOrder({ id: 'o1', state: 'verificado' })]);
    render(<OperadorGestores />);

    const badges = screen.getAllByText('Verificado');
    expect(badges.length).toBeGreaterThan(0);
  });
});

describe('OperadorGestores — columns', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('places orders in the correct column by state', () => {
    const orders = [
      buildGestorOrder({ id: 'o-creado', state: 'creado', client: { id: 'client-creado', name: 'Creado Client', phone: '', address: '' } }),
      buildGestorOrder({ id: 'o-entregado', state: 'entregado', client: { id: 'client-entregado', name: 'Entregado Client', phone: '', address: '' } }),
    ];
    setupStore(orders);
    render(<OperadorGestores />);

    expect(screen.getByText('Creado Client')).toBeInTheDocument();
    expect(screen.getByText('Entregado Client')).toBeInTheDocument();
  });
});

describe('OperadorGestores — action menu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens menu on ⋮ click, shows Detalles and Aceptar for creado', () => {
    setupStore([buildGestorOrder({ id: 'o1', state: 'creado' })]);
    render(<OperadorGestores />);

    // Only one ⋮ button on the page (the Creado column's card)
    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));

    expect(screen.getByText('Detalles')).toBeInTheDocument();
    expect(screen.getByText('Aceptar')).toBeInTheDocument();
    expect(screen.queryByText('Pagar Comisión')).not.toBeInTheDocument();
  });

  it('shows Pagar Comisión for entregado', () => {
    setupStore([buildEntregadoOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));

    expect(screen.getByText('Detalles')).toBeInTheDocument();
    expect(screen.queryByText('Aceptar')).not.toBeInTheDocument();
    expect(screen.getByText('Pagar Comisión')).toBeInTheDocument();
  });

  it('only shows Detalles for verificado', () => {
    setupStore([buildGestorOrder({ id: 'o1', state: 'verificado' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));

    expect(screen.getByText('Detalles')).toBeInTheDocument();
    expect(screen.queryByText('Aceptar')).not.toBeInTheDocument();
    expect(screen.queryByText('Pagar Comisión')).not.toBeInTheDocument();
  });

  it('menu closes on outside click', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    expect(screen.getByText('Detalles')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Detalles')).not.toBeInTheDocument();
  });

  it('menu closes on Escape key', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    expect(screen.getByText('Detalles')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Detalles')).not.toBeInTheDocument();
  });
});

describe('OperadorGestores — store integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('Aceptar moves order from creado to verificado', () => {
    setupStore([buildGestorOrder({ id: 'store-test-1', state: 'creado' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Aceptar'));

    const persisted = loadSeedState().orders.find((o) => o.id === 'store-test-1');
    expect(persisted?.state).toBe('verificado');
  });

  it('Pagar Comisión moves order from entregado to comision_pagada', () => {
    setupStore([buildEntregadoOrder({ id: 'store-test-2' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Pagar Comisión'));

    const persisted = loadSeedState().orders.find((o) => o.id === 'store-test-2');
    expect(persisted?.state).toBe('comision_pagada');
  });
});

describe('OperadorGestores — OrderDetailPopup', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('opens on Detalles click', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Detalles'));

    expect(screen.getByTestId('detail-popup')).toBeInTheDocument();
  });

  it('closes on Cerrar button', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Detalles'));
    expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

    const closeButtons = screen.getAllByRole('button', { name: /cerrar/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]); // click the text button (last one)
    expect(screen.queryByTestId('detail-popup')).not.toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Detalles'));
    expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('detail-popup')).not.toBeInTheDocument();
  });

  it('shows order detail content', () => {
    setupStore([buildGestorOrder({ id: 'o1' })]);
    render(<OperadorGestores />);

    fireEvent.click(screen.getByLabelText(/acciones del pedido/i));
    fireEvent.click(screen.getByText('Detalles'));

    // Use data-testid to scope queries within the popup
    const popup = screen.getByTestId('detail-popup');

    // Client name (appears on card too, but is present in popup)
    const clientNames = screen.getAllByText('Juan Pérez');
    expect(clientNames.length).toBe(2); // card + popup

    // Popup-specific content
    expect(popup.textContent).toContain('Pedido o1');
    expect(popup.textContent).toContain('Método: USD');
    expect(popup.textContent).toContain('Total USD: $50.00');
    expect(popup.textContent).toContain('prod-1');
  });
});

describe('OperadorGestores — structural regression', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders all 5 state column headings', () => {
    // Use one order per state to fully populate all columns
    const orders = [
      buildGestorOrder({ id: 'o1', state: 'creado' }),
      buildGestorOrder({ id: 'o2', state: 'verificado' }),
      buildGestorOrder({ id: 'o3', state: 'transportando' }),
      buildGestorOrder({ id: 'o4', state: 'entregado' }),
      buildGestorOrder({ id: 'o5', state: 'comision_pagada' }),
    ];
    setupStore(orders);
    render(<OperadorGestores />);

    // The column headings contain the state name + count (e.g. "Creado (1)")
    const headings = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headings.some((h) => h?.startsWith('Creado'))).toBe(true);
    expect(headings.some((h) => h?.startsWith('Verificado'))).toBe(true);
    expect(headings.some((h) => h?.startsWith('Transportando'))).toBe(true);
    expect(headings.some((h) => h?.startsWith('Entregado'))).toBe(true);
    expect(headings.some((h) => h?.startsWith('Comisión pagada'))).toBe(true);
  });
});
