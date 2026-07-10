import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import PedidosNuevo from '../pedidos-nuevo';
import { loadSeedState } from '../../store/seed-store';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('PedidosNuevo wizard container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the "Nuevo pedido" heading on the initial Carrito step', () => {
    render(<PedidosNuevo />);

    expect(screen.getByRole('heading', { name: /nuevo pedido/i })).toBeInTheDocument();
  });

  it('blocks advancing from Carrito with an empty cart', () => {
    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    // Still on Carrito: Cliente's "Nombre" field never appears.
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
  });

  it('Atrás returns to Carrito without losing previously selected cart lines', () => {
    const { products } = loadSeedState();
    const product = products[0];
    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));

    // Back on Carrito: the "Quitar" control (not "Agregar") proves the line survived.
    expect(
      screen.getByRole('button', { name: new RegExp(`^quitar ${escapeRegExp(product.name)} del carrito$`, 'i') }),
    ).toBeInTheDocument();
  });

  it('blocks advancing from Cliente without name/phone, and domicilio mode requires an address', () => {
    const { products } = loadSeedState();
    const product = products[0];
    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    // Default deliveryMode is domicilio -> address field visible.
    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();

    // Blocked: name+phone empty. Button now says Confirmar.
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    // Still on Cliente: "Almacén de despacho" heading visible (warehouse selector on same page).
    expect(screen.getByText('Almacén de despacho')).toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '555-1234' } });

    // Domicilio requires address -> still blocked (address input still empty).
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });

  it('recogida mode confirms the order without requiring an address', () => {
    const { products } = loadSeedState();
    const product = products[0];
    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    fireEvent.click(screen.getByRole('radio', { name: /recogida/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '555' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    // Order created — success view replaces the wizard.
    expect(screen.getByText(/pedido creado/i)).toBeInTheDocument();
  });

  it('renders a floating bar with Total: $0.00 and a cart icon (no badge) when cart is empty', () => {
    render(<PedidosNuevo />);

    expect(screen.getByText('Total: $0.00')).toBeInTheDocument();
    // Cart icon button is present, no badge rendered.
    expect(screen.getByRole('button', { name: /abrir carrito/i })).toBeInTheDocument();
    // Badge only renders as a child of the button when cart.length > 0.
    const cartBtn = screen.getByRole('button', { name: /abrir carrito/i });
    expect(cartBtn.querySelector('span.bg-primary')).toBeNull();
  });

  it('floating bar badge shows count after adding a product', () => {
    const { products } = loadSeedState();
    render(<PedidosNuevo />);

    const product = products[0];
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }),
    );

    const cartBtn = screen.getByRole('button', { name: /abrir carrito/i });
    const badge = cartBtn.querySelector('span.bg-primary');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('1');
  });

  it('popup opens when clicking the cart icon and shows Carrito heading', () => {
    const { products } = loadSeedState();
    render(<PedidosNuevo />);

    const product = products[0];
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }),
    );

    // Popup not visible yet.
    expect(screen.queryByRole('heading', { name: /carrito/i })).not.toBeInTheDocument();

    // Click cart icon → popup appears.
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    expect(screen.getByRole('heading', { name: /carrito/i })).toBeInTheDocument();
  });

  it('popup closes via the X close button', () => {
    const { products } = loadSeedState();
    render(<PedidosNuevo />);

    const product = products[0];
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }),
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    expect(screen.getByRole('heading', { name: /carrito/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cerrar carrito/i }));

    expect(screen.queryByRole('heading', { name: /carrito/i })).not.toBeInTheDocument();
  });

  it('popup closes when clicking the backdrop (outer overlay)', () => {
    const { products } = loadSeedState();
    render(<PedidosNuevo />);

    const product = products[0];
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }),
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));
    expect(screen.getByRole('heading', { name: /carrito/i })).toBeInTheDocument();

    // The backdrop is the outermost overlay div with class fixed inset-0.
    const overlay = document.querySelector('.fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay!);

    expect(screen.queryByRole('heading', { name: /carrito/i })).not.toBeInTheDocument();
  });

  it('popup shows "El carrito está vacío" when cart has no items', () => {
    render(<PedidosNuevo />);

    // Open popup with empty cart.
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    expect(screen.getByText(/el carrito está vacío/i)).toBeInTheDocument();
  });

  it('popup Trash2 button removes a line and the line disappears from the popup', () => {
    const { products } = loadSeedState();
    render(<PedidosNuevo />);

    const product = products[0];
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }),
    );
    fireEvent.click(screen.getByRole('button', { name: /abrir carrito/i }));

    // Product name appears in both the grid card and the popup.
    expect(screen.getAllByText(product.name).length).toBeGreaterThanOrEqual(2);

    // There are two "Quitar" buttons (one in the grid card, one in the popup).
    // Click the LAST one — the popup renders after the grid in the DOM.
    const quitarButtons = screen.getAllByRole('button', {
      name: new RegExp(`^quitar ${escapeRegExp(product.name)} del carrito$`, 'i'),
    });
    fireEvent.click(quitarButtons[quitarButtons.length - 1]);

    // Line gone from popup: "El carrito está vacío" is now visible.
    expect(screen.getByText(/el carrito está vacío/i)).toBeInTheDocument();

    // Product name still visible in the grid (ProductCard) but no longer shown in popup.
    expect(screen.getAllByText(product.name).length).toBe(1);
  });

  it('drives the full wizard to confirm, calling createOrder and rendering the in-place success view', () => {
    const { products, inventory, warehouses } = loadSeedState();
    // Pick the (product, warehouse) pair with the largest stock to guarantee eligibility.
    const best = inventory.reduce((a, b) => (b.quantity > a.quantity ? b : a));
    const product = products.find((p) => p.id === best.productId)!;
    const warehouseName = warehouses.find((w) => w.id === best.warehouseId)!.name;

    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '555-1234' } });
    fireEvent.change(screen.getByLabelText(/dirección/i), { target: { value: 'Calle 1' } });

    // Warehouse is auto-selected by the effect; just confirm.
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(screen.getByText(/pedido creado/i)).toBeInTheDocument();

    const persisted = loadSeedState();
    const created = persisted.orders.find((order) => order.id.startsWith('order-user-'));
    expect(created).toBeDefined();
    expect(created?.state).toBe('creado');
    expect(created?.client.name).toBe('Ana Pérez');
    expect(created?.warehouseId).toBe(best.warehouseId);
    expect(created?.commissionMN).toBeUndefined();
    expect(created?.totalMN).toBeUndefined();
    expect(created?.exchangeRateSnapshot).toBeUndefined();
  });
});
