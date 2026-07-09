import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, VERSION } from '../../seed/constants';
import type { CreateOrderInput } from '../seed-store';
import type { OrderItem } from '../../domain/types';

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
      payment: { method: 'efectivo', needsChange: true },
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
});
