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

    // Blocked: name+phone empty.
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));
    expect(screen.queryByRole('radio', { name: /^(?!domicilio$)(?!recogida$).+/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana Pérez' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '555-1234' } });

    // Domicilio requires address -> still blocked (address input still empty).
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));
    expect(screen.getByLabelText(/nombre/i)).toBeInTheDocument();
  });

  it('recogida mode advances to Almacén without requiring an address', () => {
    const { products } = loadSeedState();
    const product = products[0];
    render(<PedidosNuevo />);

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^agregar ${escapeRegExp(product.name)} al carrito$`, 'i') }));
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    fireEvent.click(screen.getByRole('radio', { name: /recogida/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/teléfono/i), { target: { value: '555' } });
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    // No longer on Cliente (address/nombre inputs gone) — reached Almacén.
    expect(screen.queryByLabelText(/nombre/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /almacén/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^siguiente$/i }));

    fireEvent.click(screen.getByRole('radio', { name: new RegExp(escapeRegExp(warehouseName), 'i') }));
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
