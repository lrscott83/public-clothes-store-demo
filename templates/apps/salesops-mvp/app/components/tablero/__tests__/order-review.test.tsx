import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderReview } from '../order-review';
import type { Gestor, Order } from '../../../domain/types';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    items: [{ productId: 'p-1', quantity: 2, priceUSD: 50, commissionMN: 10 }],
    client: { id: 'client-1', name: 'Ana Pérez', phone: '555-1234', address: 'Calle 1', deliveryMode: 'domicilio' },
    payment: { method: 'efectivo', needsChange: true },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state: 'creado',
    totalUSD: 100,
    createdAt: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

const gestor: Gestor = { id: 'gestor-1', name: 'Yasmani Alonso', phone: '+53 5123 4567' };

describe('OrderReview', () => {
  it('renders items, client/delivery/payment data, gestor name+phone, and an availability line', () => {
    render(
      <OrderReview order={buildOrder()} gestor={gestor} availableAtWarehouse onAceptar={vi.fn()} onBack={vi.fn()} />,
    );

    expect(screen.getByText(/p-1/)).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('555-1234')).toBeInTheDocument();
    expect(screen.getByText('Calle 1')).toBeInTheDocument();
    expect(screen.getByText('efectivo')).toBeInTheDocument();
    expect(screen.getByText('Yasmani Alonso')).toBeInTheDocument();
    expect(screen.getByText('+53 5123 4567')).toBeInTheDocument();
    expect(screen.getByText(/stock disponible/i)).toBeInTheDocument();
  });

  it('shows an insufficient-stock line when availableAtWarehouse is false', () => {
    render(
      <OrderReview
        order={buildOrder()}
        gestor={gestor}
        availableAtWarehouse={false}
        onAceptar={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/stock insuficiente/i)).toBeInTheDocument();
  });

  it('"Aceptar" fires onAceptar', () => {
    const onAceptar = vi.fn();
    render(
      <OrderReview
        order={buildOrder()}
        gestor={gestor}
        availableAtWarehouse
        onAceptar={onAceptar}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }));

    expect(onAceptar).toHaveBeenCalledTimes(1);
  });

  it('the back action fires onBack', () => {
    const onBack = vi.fn();
    render(
      <OrderReview
        order={buildOrder()}
        gestor={gestor}
        availableAtWarehouse
        onAceptar={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows "Sin asignar" when no gestor is found', () => {
    render(
      <OrderReview
        order={buildOrder()}
        gestor={undefined}
        availableAtWarehouse
        onAceptar={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/sin asignar/i)).toBeInTheDocument();
  });
});
