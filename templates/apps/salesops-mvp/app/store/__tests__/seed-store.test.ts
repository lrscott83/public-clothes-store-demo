import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, VERSION } from '../../seed/constants';
import type { CreateOrderInput } from '../seed-store';
import type { OrderItem, OrderState } from '../../domain/types';
import { sumOrderCommission } from '../../seed/enrich-products';

describe('seed-store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('saveSeedState then loadSeedState returns a deep-equal SeedState', async () => {
    const { generateSeedState } = await import('../../seed/generate');
    const { saveSeedState, loadSeedState } = await import('../seed-store');

    const state = generateSeedState();
    saveSeedState(state);
    const loaded = loadSeedState();

    expect(loaded).toEqual(state);
  });

  it('regenerates and persists when the storage key is missing', async () => {
    const { loadSeedState } = await import('../seed-store');

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const loaded = loadSeedState();

    expect(loaded.version).toBe(VERSION);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(loaded);
  });

  it('regenerates and persists when the stored version does not match', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION - 1, stale: true }));
    const { loadSeedState } = await import('../seed-store');

    const loaded = loadSeedState();
    expect(loaded.version).toBe(VERSION);
    expect(loaded).not.toHaveProperty('stale');
  });

  it('resetDemo clears the key and regenerates a byte-identical SeedState', async () => {
    const { loadSeedState, resetDemo } = await import('../seed-store');

    const first = loadSeedState();
    const second = resetDemo();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  describe('createOrder', () => {
    const items: OrderItem[] = [
      { productId: 'p-1', quantity: 2, priceUSD: 50, commissionMN: 100 },
      { productId: 'p-2', quantity: 1, priceUSD: 30, commissionMN: 50 },
    ];

    const baseInput: CreateOrderInput = {
      items,
      client: {
        id: 'client-user-1',
        name: 'Ana Pérez',
        phone: '555-1234',
        address: 'Calle 1',
        deliveryMode: 'domicilio',
      },
      payment: { method: 'USD', needsChange: true },
      warehouseId: 'wh-1',
      gestorId: 'gestor-1',
    };

    it('appends an Order with state "creado" and totalUSD = cartTotalUSD(items)', async () => {
      const { cartTotalUSD } = await import('../../domain/cart');
      const { loadSeedState, createOrder } = await import('../seed-store');

      loadSeedState();
      const before = loadSeedState().orders.length;
      const order = createOrder(baseInput, new Date('2026-07-09T12:00:00.000Z'));

      expect(order.state).toBe('creado');
      expect(order.totalUSD).toBe(cartTotalUSD(items));
      expect(order.items).toEqual(items);
      expect(order.client).toEqual(baseInput.client);
      expect(order.payment).toEqual(baseInput.payment);
      expect(order.warehouseId).toBe('wh-1');
      expect(order.gestorId).toBe('gestor-1');
      expect(loadSeedState().orders.length).toBe(before + 1);
    });

    it('sets createdAt from the injected now and leaves commissionMN/totalMN/exchangeRateSnapshot undefined', async () => {
      const { createOrder, loadSeedState } = await import('../seed-store');
      loadSeedState();
      const now = new Date('2026-07-09T12:00:00.000Z');

      const order = createOrder(baseInput, now);

      expect(order.createdAt).toBe(now.toISOString());
      expect(order.commissionMN).toBeUndefined();
      expect(order.totalMN).toBeUndefined();
      expect(order.exchangeRateSnapshot).toBeUndefined();
    });

    it('snapshots the current exchange rate + totalMN when the payment method is non-USD (MN)', async () => {
      const { createOrder, loadSeedState } = await import('../seed-store');
      const { cartTotalUSD } = await import('../../domain/cart');
      const state = loadSeedState();
      const rate = state.exchangeRates.usdToMn;

      const mnInput: CreateOrderInput = { ...baseInput, payment: { method: 'MN' } };
      const order = createOrder(mnInput, new Date('2026-07-09T12:00:00.000Z'));

      expect(order.exchangeRateSnapshot).toEqual({ usdToMn: rate });
      expect(order.totalMN).toBe(Math.round(cartTotalUSD(items) * rate));
      // commission is still frozen only at verification, not at creation.
      expect(order.commissionMN).toBeUndefined();
    });

    it('assigns unique, incrementing order-user-N ids', async () => {
      const { createOrder, loadSeedState } = await import('../seed-store');
      loadSeedState();

      const first = createOrder(baseInput, new Date());
      const second = createOrder(baseInput, new Date());

      expect(first.id).toMatch(/^order-user-\d+$/);
      expect(second.id).toMatch(/^order-user-\d+$/);
      expect(first.id).not.toBe(second.id);

      const firstNum = Number(first.id.replace('order-user-', ''));
      const secondNum = Number(second.id.replace('order-user-', ''));
      expect(secondNum).toBeGreaterThan(firstNum);
    });

    it('persists the created order so it survives a loadSeedState reload', async () => {
      const { createOrder, loadSeedState } = await import('../seed-store');
      loadSeedState();
      const created = createOrder(baseInput, new Date('2026-07-09T12:00:00.000Z'));

      const reloaded = loadSeedState();

      expect(reloaded.orders.find((order) => order.id === created.id)).toEqual(created);
    });

    it('resetDemo discards orders created after the last seed generation', async () => {
      const { createOrder, loadSeedState, resetDemo } = await import('../seed-store');
      loadSeedState();
      const created = createOrder(baseInput, new Date());
      expect(loadSeedState().orders.some((order) => order.id === created.id)).toBe(true);

      const reset = resetDemo();

      expect(reset.orders.some((order) => order.id === created.id)).toBe(false);
    });
  });

  describe('verifyOrder / markCommissionPaid', () => {
    const items: OrderItem[] = [
      { productId: 'p-1', quantity: 2, priceUSD: 50, commissionMN: 100 },
      { productId: 'p-2', quantity: 1, priceUSD: 30, commissionMN: 50 },
    ];

    const baseInput: CreateOrderInput = {
      items,
      client: { id: 'client-user-1', name: 'Ana Pérez' },
      payment: { method: 'USD' },
      warehouseId: 'wh-1',
      gestorId: 'gestor-1',
    };

    /** Directly force an order's `state` field, bypassing the store's own
     * transition APIs — used only to set up guard-test fixtures for states
     * that `createOrder` cannot produce on its own (e.g. `entregado`). */
    async function forceOrderState(orderId: string, state: OrderState) {
      const { loadSeedState, saveSeedState } = await import('../seed-store');
      const seedState = loadSeedState();
      const order = seedState.orders.find((o) => o.id === orderId);
      if (!order) throw new Error(`order ${orderId} not found`);
      order.state = state;
      saveSeedState(seedState);
    }

    describe('verifyOrder', () => {
      it('transitions creado→verificado and freezes exact totals', async () => {
        const { createOrder, loadSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date('2026-07-09T12:00:00.000Z'));
        const now = new Date('2026-07-09T15:30:00.000Z');

        const result = verifyOrder(created.id, now);

        expect(result.state).toBe('verificado');
        expect(result.exchangeRateSnapshot).toEqual({ usdToMn: 680 });
        expect(result.totalMN).toBe(Math.round(created.totalUSD * 680));
        expect(result.commissionMN).toBe(sumOrderCommission(items));
        expect(result.verifiedAt).toBe(now.toISOString());
      });

      it('freezes from the CURRENT state.exchangeRates.usdToMn at verify time', async () => {
        const { createOrder, loadSeedState, saveSeedState, verifyOrder } = await import('../seed-store');
        const seedState = loadSeedState();
        seedState.exchangeRates.usdToMn = 700;
        saveSeedState(seedState);
        const created = createOrder(baseInput, new Date());

        const result = verifyOrder(created.id, new Date());

        expect(result.exchangeRateSnapshot).toEqual({ usdToMn: 700 });
        expect(result.totalMN).toBe(Math.round(created.totalUSD * 700));
      });

      it('does not mutate SeedState.inventory (availability is informational only)', async () => {
        const { createOrder, loadSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        const inventoryBefore = JSON.stringify(loadSeedState().inventory);

        verifyOrder(created.id, new Date());

        expect(JSON.stringify(loadSeedState().inventory)).toBe(inventoryBefore);
      });

      it('throws when the order is not in state "creado"', async () => {
        const { createOrder, loadSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        await forceOrderState(created.id, 'verificado');

        expect(() => verifyOrder(created.id)).toThrow(/creado/i);
        expect(loadSeedState().orders.find((o) => o.id === created.id)?.state).toBe('verificado');
      });

      it('throws when the order id does not exist', async () => {
        const { loadSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();

        expect(() => verifyOrder('order-does-not-exist')).toThrow(/not found/i);
      });

      it('persists the verification so it survives a loadSeedState reload', async () => {
        const { createOrder, loadSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        const now = new Date('2026-07-09T15:30:00.000Z');
        const verified = verifyOrder(created.id, now);

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id);

        expect(reloaded).toEqual(verified);
      });

      it('IMMUTABILITY regression: a later rate change does not alter a verified order frozen totals', async () => {
        const { createOrder, loadSeedState, saveSeedState, verifyOrder } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        const verified = verifyOrder(created.id, new Date('2026-07-09T15:30:00.000Z'));

        expect(verified.exchangeRateSnapshot).toEqual({ usdToMn: 680 });

        const seedState = loadSeedState();
        seedState.exchangeRates.usdToMn = 999;
        saveSeedState(seedState);

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id)!;

        expect(reloaded.exchangeRateSnapshot).toEqual({ usdToMn: 680 });
        expect(reloaded.totalMN).toBe(verified.totalMN);
        expect(reloaded.commissionMN).toBe(verified.commissionMN);
      });
    });

    describe('markCommissionPaid', () => {
      it('transitions entregado→comision_pagada and stamps commissionPaidAt without touching frozen fields', async () => {
        const { createOrder, loadSeedState, verifyOrder, markCommissionPaid } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        const verified = verifyOrder(created.id, new Date('2026-07-09T15:30:00.000Z'));
        await forceOrderState(created.id, 'entregado');
        const now = new Date('2026-07-10T09:00:00.000Z');

        const result = markCommissionPaid(created.id, now);

        expect(result.state).toBe('comision_pagada');
        expect(result.commissionPaidAt).toBe(now.toISOString());
        expect(result.exchangeRateSnapshot).toEqual(verified.exchangeRateSnapshot);
        expect(result.totalMN).toBe(verified.totalMN);
        expect(result.commissionMN).toBe(verified.commissionMN);
      });

      it('throws when the order is not in state "entregado"', async () => {
        const { createOrder, loadSeedState, markCommissionPaid } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());

        expect(() => markCommissionPaid(created.id)).toThrow(/entregado/i);
        expect(loadSeedState().orders.find((o) => o.id === created.id)?.state).toBe('creado');
      });

      it('throws when the order id does not exist', async () => {
        const { loadSeedState, markCommissionPaid } = await import('../seed-store');
        loadSeedState();

        expect(() => markCommissionPaid('order-does-not-exist')).toThrow(/not found/i);
      });

      it('persists the commission-paid transition so it survives a loadSeedState reload', async () => {
        const { createOrder, loadSeedState, verifyOrder, markCommissionPaid } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());
        await forceOrderState(created.id, 'entregado');
        const now = new Date('2026-07-10T09:00:00.000Z');
        const paid = markCommissionPaid(created.id, now);

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id);

        expect(reloaded).toEqual(paid);
      });
    });

    it('resetDemo discards verify/paid transitions (regenerated orders revert to deterministic seed state)', async () => {
      const { createOrder, loadSeedState, verifyOrder, resetDemo } = await import('../seed-store');
      loadSeedState();
      const created = createOrder(baseInput, new Date());
      verifyOrder(created.id, new Date());
      expect(loadSeedState().orders.some((order) => order.id === created.id)).toBe(true);

      const reset = resetDemo();

      expect(reset.orders.some((order) => order.id === created.id)).toBe(false);
    });

    describe('assignTransportista', () => {
      it('transitions verificado→transportando, sets transportistaId, and stamps transportingAt', async () => {
        const { createOrder, loadSeedState, verifyOrder, assignTransportista } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());
        const now = new Date('2026-07-09T16:00:00.000Z');

        const result = assignTransportista(created.id, 'transportista-1', now);

        expect(result.state).toBe('transportando');
        expect(result.transportistaId).toBe('transportista-1');
        expect(result.transportingAt).toBe(now.toISOString());
      });

      it('persists the assignment so it survives a loadSeedState reload', async () => {
        const { createOrder, loadSeedState, verifyOrder, assignTransportista } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());
        const assigned = assignTransportista(created.id, 'transportista-1', new Date());

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id);

        expect(reloaded).toEqual(assigned);
      });

      it('throws when the order is not in state "verificado"', async () => {
        const { createOrder, loadSeedState, assignTransportista } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());

        expect(() => assignTransportista(created.id, 'transportista-1')).toThrow(/verificado/i);
        expect(loadSeedState().orders.find((o) => o.id === created.id)?.state).toBe('creado');
      });

      it('throws when the order id does not exist', async () => {
        const { loadSeedState, assignTransportista } = await import('../seed-store');
        loadSeedState();

        expect(() => assignTransportista('order-does-not-exist', 'transportista-1')).toThrow(/not found/i);
      });

      it('IMMUTABILITY regression: assigning a transportista does not alter frozen totals even after a later rate change', async () => {
        const { createOrder, loadSeedState, saveSeedState, verifyOrder, assignTransportista } = await import(
          '../seed-store'
        );
        const seedState = loadSeedState();
        seedState.exchangeRates.usdToMn = 40;
        saveSeedState(seedState);
        const created = createOrder(baseInput, new Date());
        const verified = verifyOrder(created.id, new Date());

        expect(verified.exchangeRateSnapshot).toEqual({ usdToMn: 40 });

        const rateChangedState = loadSeedState();
        rateChangedState.exchangeRates.usdToMn = 999;
        saveSeedState(rateChangedState);

        const assigned = assignTransportista(created.id, 'transportista-1', new Date());

        expect(assigned.exchangeRateSnapshot).toEqual({ usdToMn: 40 });
        expect(assigned.totalMN).toBe(verified.totalMN);
        expect(assigned.commissionMN).toBe(verified.commissionMN);

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id)!;
        expect(reloaded.exchangeRateSnapshot).toEqual({ usdToMn: 40 });
        expect(reloaded.totalMN).toBe(verified.totalMN);
        expect(reloaded.commissionMN).toBe(verified.commissionMN);
      });
    });

    describe('markDelivered', () => {
      it('transitions transportando→entregado and stamps deliveredAt', async () => {
        const { createOrder, loadSeedState, verifyOrder, assignTransportista, markDelivered } = await import(
          '../seed-store'
        );
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());
        assignTransportista(created.id, 'transportista-1', new Date());
        const now = new Date('2026-07-10T09:00:00.000Z');

        const result = markDelivered(created.id, now);

        expect(result.state).toBe('entregado');
        expect(result.deliveredAt).toBe(now.toISOString());
      });

      it('persists the delivery so it survives a loadSeedState reload', async () => {
        const { createOrder, loadSeedState, verifyOrder, assignTransportista, markDelivered } = await import(
          '../seed-store'
        );
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());
        assignTransportista(created.id, 'transportista-1', new Date());
        const delivered = markDelivered(created.id, new Date());

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id);

        expect(reloaded).toEqual(delivered);
      });

      it('throws when the order is not in state "transportando"', async () => {
        const { createOrder, loadSeedState, verifyOrder, markDelivered } = await import('../seed-store');
        loadSeedState();
        const created = createOrder(baseInput, new Date());
        verifyOrder(created.id, new Date());

        expect(() => markDelivered(created.id)).toThrow(/transportando/i);
        expect(loadSeedState().orders.find((o) => o.id === created.id)?.state).toBe('verificado');
      });

      it('throws when the order id does not exist', async () => {
        const { loadSeedState, markDelivered } = await import('../seed-store');
        loadSeedState();

        expect(() => markDelivered('order-does-not-exist')).toThrow(/not found/i);
      });

      it('IMMUTABILITY regression: marking delivered does not alter frozen totals even after a later rate change', async () => {
        const { createOrder, loadSeedState, saveSeedState, verifyOrder, assignTransportista, markDelivered } =
          await import('../seed-store');
        const seedState = loadSeedState();
        seedState.exchangeRates.usdToMn = 40;
        saveSeedState(seedState);
        const created = createOrder(baseInput, new Date());
        const verified = verifyOrder(created.id, new Date());
        const assigned = assignTransportista(created.id, 'transportista-1', new Date());

        expect(assigned.exchangeRateSnapshot).toEqual({ usdToMn: 40 });

        const rateChangedState = loadSeedState();
        rateChangedState.exchangeRates.usdToMn = 999;
        saveSeedState(rateChangedState);

        const delivered = markDelivered(created.id, new Date());

        expect(delivered.exchangeRateSnapshot).toEqual({ usdToMn: 40 });
        expect(delivered.totalMN).toBe(verified.totalMN);
        expect(delivered.commissionMN).toBe(verified.commissionMN);

        const reloaded = loadSeedState().orders.find((o) => o.id === created.id)!;
        expect(reloaded.exchangeRateSnapshot).toEqual({ usdToMn: 40 });
        expect(reloaded.totalMN).toBe(verified.totalMN);
        expect(reloaded.commissionMN).toBe(verified.commissionMN);
      });
    });

    it('resetDemo discards assignTransportista/markDelivered transitions (regenerated orders revert to deterministic seed state)', async () => {
      const { createOrder, loadSeedState, verifyOrder, assignTransportista, markDelivered, resetDemo } =
        await import('../seed-store');
      loadSeedState();
      const created = createOrder(baseInput, new Date());
      verifyOrder(created.id, new Date());
      assignTransportista(created.id, 'transportista-1', new Date());
      markDelivered(created.id, new Date());
      expect(loadSeedState().orders.some((order) => order.id === created.id)).toBe(true);

      const reset = resetDemo();

      expect(reset.orders.some((order) => order.id === created.id)).toBe(false);
    });
  });

  describe('updateExchangeRates', () => {
    it('replaces all three rates in one call and reflects them after a reload', async () => {
      const { loadSeedState, updateExchangeRates } = await import('../seed-store');
      loadSeedState();

      const result = updateExchangeRates({ usdToMn: 700, zelle: 1.05, eur: 1.1 });

      expect(result.exchangeRates).toEqual({ usdToMn: 700, zelle: 1.05, eur: 1.1 });
      expect(loadSeedState().exchangeRates).toEqual({ usdToMn: 700, zelle: 1.05, eur: 1.1 });
    });

    it('does not touch state.orders', async () => {
      const { createOrder, loadSeedState, updateExchangeRates } = await import('../seed-store');
      loadSeedState();
      createOrder(
        {
          items: [{ productId: 'p-1', quantity: 1, priceUSD: 50, commissionMN: 10 }],
          client: { id: 'client-user-1', name: 'Ana Pérez' },
          payment: { method: 'USD' },
          warehouseId: 'wh-1',
          gestorId: 'gestor-1',
        },
        new Date(),
      );
      const ordersBefore = JSON.stringify(loadSeedState().orders);

      updateExchangeRates({ usdToMn: 700, zelle: 1.05, eur: 1.1 });

      expect(JSON.stringify(loadSeedState().orders)).toBe(ordersBefore);
    });

    it('IMMUTABILITY regression: a verified order keeps its frozen snapshot after updateExchangeRates, and a later-verified order uses the new rate', async () => {
      const { createOrder, loadSeedState, verifyOrder, updateExchangeRates } = await import('../seed-store');
      loadSeedState();
      const items = [{ productId: 'p-1', quantity: 1, priceUSD: 50, commissionMN: 10 }];
      const baseInput: CreateOrderInput = {
        items,
        client: { id: 'client-user-1', name: 'Ana Pérez' },
        payment: { method: 'USD' },
        warehouseId: 'wh-1',
        gestorId: 'gestor-1',
      };

      const createdBefore = createOrder(baseInput, new Date());
      const verified = verifyOrder(createdBefore.id, new Date());
      expect(verified.exchangeRateSnapshot).toEqual({ usdToMn: 680 });

      updateExchangeRates({ usdToMn: 999, zelle: 2, eur: 2 });

      const reloaded = loadSeedState().orders.find((o) => o.id === createdBefore.id)!;
      expect(reloaded.exchangeRateSnapshot).toEqual({ usdToMn: 680 });
      expect(reloaded.totalMN).toBe(verified.totalMN);
      expect(reloaded.commissionMN).toBe(verified.commissionMN);

      const createdAfter = createOrder(baseInput, new Date());
      const verifiedAfter = verifyOrder(createdAfter.id, new Date());

      expect(verifiedAfter.exchangeRateSnapshot).toEqual({ usdToMn: 999 });
      expect(verifiedAfter.totalMN).toBe(Math.round(createdAfter.totalUSD * 999));
    });
  });
});
