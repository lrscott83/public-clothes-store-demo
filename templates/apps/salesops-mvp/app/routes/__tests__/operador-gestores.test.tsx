import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import OperadorGestores from '../operador-gestores';
import { createOrder, loadSeedState, saveSeedState } from '../../store/seed-store';
import type { CreateOrderInput } from '../../store/seed-store';
import type { Order, OrderItem } from '../../domain/types';

const items: OrderItem[] = [{ productId: 'p-1', quantity: 1, priceUSD: 50, commissionMN: 10 }];

const baseInput: CreateOrderInput = {
  items,
  client: { id: 'client-user-1', name: 'Ana Pérez', phone: '+53 5555 0100' },
  payment: { method: 'USD' },
  warehouseId: 'wh-1',
  gestorId: 'gestor-1',
};

/** Pushes a fully-formed Order directly into the persisted SeedState. */
function pushOrder(order: Order) {
  const state = loadSeedState();
  state.orders.push(order);
  saveSeedState(state);
}

/** Builds a minimal Order fixture with sensible defaults. */
function buildGestorOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-test-1',
    state: 'creado',
    gestorId: 'gestor-1',
    client: { name: 'Juan Pérez', phone: '+53 5555 0100', address: 'Calle 123' },
    items: [{ productId: 'prod-1', quantity: 2, priceUSD: 25, commissionMN: 10 }],
    payment: { method: 'USD' },
    warehouseId: 'wh-1',
    totalUSD: 50,
    exchangeRateSnapshot: { usdToMn: 680 },
    totalMN: 34000,
    commissionMN: 500,
    createdAt: '2026-07-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('OperadorGestores', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('card rendering', () => {
    it('renders the heading and all orders as cards', () => {
      loadSeedState();
      render(<OperadorGestores />);

      expect(screen.getByRole('heading', { name: /operador de gestores/i })).toBeInTheDocument();
      expect(screen.getByTestId('order-list')).toBeInTheDocument();
      expect(screen.getAllByTestId('order-card').length).toBeGreaterThan(0);
    });

    it('card shows gestor name and phone with WhatsApp link', () => {
      loadSeedState();
      const order = createOrder(baseInput, new Date('2026-07-10'));
      render(<OperadorGestores />);

      const cards = screen.getAllByTestId('order-card');
      const card = cards.find((c) => c.textContent?.includes('Ana Pérez'))!;

      // gestor-1 = Yasmani Alonso, phone = +53 5123 4567
      expect(card.textContent).toContain('Yasmani Alonso');
      expect(card.textContent).toContain('+53 5123 4567');

      const whatsappLink = card.querySelector('a[aria-label="WhatsApp"]');
      expect(whatsappLink).toBeInTheDocument();
      expect(whatsappLink).toHaveAttribute('href', 'https://wa.me/5351234567');
    });

    it('card does NOT show order ID', () => {
      loadSeedState();
      const order = createOrder(baseInput, new Date('2026-07-10'));
      render(<OperadorGestores />);

      // The card should NOT display the order.id — it only appears in the popup
      expect(screen.queryByText(order.id)).not.toBeInTheDocument();
    });

    it('card shows state badge with correct text', () => {
      loadSeedState();
      render(<OperadorGestores />);

      const badges = screen.getAllByTestId('state-badge');
      expect(badges.length).toBeGreaterThan(0);

      // All badges should have one of the valid state labels
      const validLabels = ['Creado', 'Verificado', 'Transportando', 'Entregado', 'Comisión Pagada'];
      for (const badge of badges) {
        expect(validLabels).toContain(badge.textContent);
      }
    });
  });

  describe('action menu (dropdown)', () => {
    it('opens dropdown on ⋮ click and shows Detalles', () => {
      loadSeedState();
      render(<OperadorGestores />);

      const toggle = screen.getAllByTestId('menu-toggle')[0];
      fireEvent.click(toggle);

      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();
      expect(screen.getByText('Detalles')).toBeInTheDocument();
    });

    it('closes dropdown on second ⋮ click', () => {
      loadSeedState();
      render(<OperadorGestores />);

      const toggle = screen.getAllByTestId('menu-toggle')[0];
      fireEvent.click(toggle);
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
    });

    it('closes dropdown on outside click', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
    });

    it('closes dropdown on Escape key', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      expect(screen.getByTestId('dropdown-menu')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('dropdown-menu')).not.toBeInTheDocument();
    });

    it('Aceptar only visible for creado orders', () => {
      loadSeedState();
      render(<OperadorGestores />);

      // Find a card with a creado order (check state badge text "Creado")
      const cards = screen.getAllByTestId('order-card');
      const creadoCard = cards.find((c) => c.querySelector('[data-testid="state-badge"]')?.textContent === 'Creado');
      expect(creadoCard).toBeDefined();
      if (!creadoCard) return;

      fireEvent.click(creadoCard.querySelector('[data-testid="menu-toggle"]')!);
      expect(screen.getByText('Aceptar')).toBeInTheDocument();
      expect(screen.getByText('Detalles')).toBeInTheDocument();
    });

    it('Aceptar NOT visible for non-creado orders', () => {
      const noCreado = buildGestorOrder({
        id: 'order-aceptar-hidden',
        state: 'verificado',
        client: { name: 'Aceptar Hidden Test' },
        totalMN: 34000,
        exchangeRateSnapshot: { usdToMn: 680 },
        commissionMN: 500,
        createdAt: '2026-07-01T12:00:00.000Z',
      });
      loadSeedState();
      pushOrder(noCreado);
      render(<OperadorGestores />);

      const cards = screen.getAllByTestId('order-card');
      const card = cards.find((c) => c.textContent?.includes('Aceptar Hidden Test'))!;
      fireEvent.click(card.querySelector('[data-testid="menu-toggle"]')!);

      expect(screen.getByText('Detalles')).toBeInTheDocument();
      expect(screen.queryByText('Aceptar')).not.toBeInTheDocument();
    });

    it('Pagar Comisión only visible for entregado orders', () => {
      const entregado = buildGestorOrder({
        id: 'order-pagar-visible',
        state: 'entregado',
        client: { name: 'Pagar Visible Test' },
        totalMN: 34000,
        exchangeRateSnapshot: { usdToMn: 680 },
        commissionMN: 500,
        createdAt: '2026-07-01T12:00:00.000Z',
      });
      loadSeedState();
      pushOrder(entregado);
      render(<OperadorGestores />);

      const cards = screen.getAllByTestId('order-card');
      const card = cards.find((c) => c.textContent?.includes('Pagar Visible Test'))!;
      fireEvent.click(card.querySelector('[data-testid="menu-toggle"]')!);

      expect(screen.getByText('Pagar Comisión')).toBeInTheDocument();
      expect(screen.queryByText('Aceptar')).not.toBeInTheDocument();
    });

    it('Pagar Comisión NOT visible for non-entregado orders', () => {
      loadSeedState();
      render(<OperadorGestores />);

      // Find a creado card (most common) — Pagar should NOT be visible
      const cards = screen.getAllByTestId('order-card');
      const creadoCard = cards.find(
        (c) => c.querySelector('[data-testid="state-badge"]')?.textContent === 'Creado',
      );
      expect(creadoCard).toBeDefined();
      if (!creadoCard) return;

      fireEvent.click(creadoCard.querySelector('[data-testid="menu-toggle"]')!);
      expect(screen.queryByText('Pagar Comisión')).not.toBeInTheDocument();
    });
  });

  describe('dropdown isolation', () => {
    it('only one dropdown open at a time', () => {
      loadSeedState();
      render(<OperadorGestores />);

      const toggles = screen.getAllByTestId('menu-toggle');
      expect(toggles.length).toBeGreaterThanOrEqual(2);

      // Open first dropdown
      fireEvent.click(toggles[0]);
      expect(screen.getAllByTestId('dropdown-menu').length).toBe(1);

      // Open second dropdown — first should close
      fireEvent.click(toggles[1]);
      expect(screen.getAllByTestId('dropdown-menu').length).toBe(1);
    });
  });

  describe('action gating via store', () => {
    it('calling Aceptar moves order from creado to verificado', () => {
      loadSeedState();
      const order = createOrder(baseInput, new Date('2026-07-10'));
      render(<OperadorGestores />);

      const cards = screen.getAllByTestId('order-card');
      const card = cards.find((c) => c.textContent?.includes('Ana Pérez'))!;
      fireEvent.click(card.querySelector('[data-testid="menu-toggle"]')!);
      fireEvent.click(screen.getByText('Aceptar'));

      const persisted = loadSeedState().orders.find((o) => o.id === order.id);
      expect(persisted?.state).toBe('verificado');
      expect(persisted?.totalMN).toBeDefined();
    });

    it('calling Pagar Comisión moves from entregado to comision_pagada', () => {
      const entregado = buildGestorOrder({
        id: 'order-pagar-integration',
        state: 'entregado',
        client: { name: 'Pagar Integration Test' },
        totalMN: 34000,
        commissionMN: 500,
        exchangeRateSnapshot: { usdToMn: 680 },
        createdAt: '2026-07-01T12:00:00.000Z',
      });
      loadSeedState();
      pushOrder(entregado);
      render(<OperadorGestores />);

      const cards = screen.getAllByTestId('order-card');
      const card = cards.find((c) => c.textContent?.includes('Pagar Integration Test'))!;
      fireEvent.click(card.querySelector('[data-testid="menu-toggle"]')!);
      fireEvent.click(screen.getByText('Pagar Comisión'));

      const persisted = loadSeedState().orders.find((o) => o.id === entregado.id);
      expect(persisted?.state).toBe('comision_pagada');
      expect(persisted?.commissionPaidAt).toBeDefined();
      // Frozen fields untouched
      expect(persisted?.totalMN).toBe(34000);
      expect(persisted?.commissionMN).toBe(500);
    });
  });

  describe('OrderDetailPopup', () => {
    it('opens popup on Detalles click and shows order details', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));

      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Pedido order-/)).toBeInTheDocument();
    });

    it('popup closes on backdrop click', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));
      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

      // Click on backdrop (the overlay itself)
      fireEvent.click(screen.getByTestId('detail-popup'));

      expect(screen.queryByTestId('detail-popup')).not.toBeInTheDocument();
    });

    it('popup closes on Escape key', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));
      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByTestId('detail-popup')).not.toBeInTheDocument();
    });

    it('popup closes on Cerrar button', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));
      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cerrar'));

      expect(screen.queryByTestId('detail-popup')).not.toBeInTheDocument();
    });

    it('click inside popup does not close it (stopPropagation)', () => {
      loadSeedState();
      render(<OperadorGestores />);

      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));
      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();

      // Click on the inner content panel (the child div)
      const innerPanel = screen.getByRole('dialog').querySelector('div > div');
      if (innerPanel) {
        fireEvent.click(innerPanel);
      }

      // Popup should still be open
      expect(screen.getByTestId('detail-popup')).toBeInTheDocument();
    });

    it('popup shows client info, items, and gestor data', () => {
      loadSeedState();
      render(<OperadorGestores />);

      // Open popup for the first card
      fireEvent.click(screen.getAllByTestId('menu-toggle')[0]);
      fireEvent.click(screen.getByText('Detalles'));

      // Should have all sections (use getByRole for unique heading, getAllByText for non-unique)
      expect(screen.getByRole('heading', { name: 'Cliente' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Pago' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Artículos' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Gestor' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Almacén' })).toBeInTheDocument();
    });
  });

  describe('structural regression', () => {
    it('does NOT render KanbanBoard or OrderReview', () => {
      loadSeedState();
      render(<OperadorGestores />);

      // No kanban columns or review view
      // "Creado" badge exists on cards (multiple found, use getAll)
      expect(screen.getAllByText(/Creado/i).length).toBeGreaterThan(0);
      expect(screen.queryByText(/Revisar pedido/i)).not.toBeInTheDocument();
    });
  });
});
