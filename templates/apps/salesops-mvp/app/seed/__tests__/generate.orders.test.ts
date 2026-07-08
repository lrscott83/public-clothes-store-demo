import { describe, expect, it } from 'vitest';
import { generateSeedState } from '../generate';
import { ANCHOR_ISO } from '../constants';

const VALID_STATES = ['creado', 'verificado', 'transportando', 'entregado', 'comision_pagada'];
const ANCHOR_MS = new Date(ANCHOR_ISO).getTime();
const WINDOW_START_MS = ANCHOR_MS - 19 * 24 * 60 * 60 * 1000;

describe('generateSeedState — order state machine', () => {
  it('assigns every order a valid state', () => {
    const state = generateSeedState();
    expect(state.orders.length).toBeGreaterThan(0);
    for (const order of state.orders) {
      expect(VALID_STATES).toContain(order.state);
    }
  });

  it('keeps populated per-state timestamps chronologically non-decreasing', () => {
    const state = generateSeedState();
    for (const order of state.orders) {
      const stamps = [
        order.createdAt,
        order.verifiedAt,
        order.transportingAt,
        order.deliveredAt,
        order.commissionPaidAt,
      ].filter((v): v is string => Boolean(v));

      for (let i = 1; i < stamps.length; i++) {
        expect(new Date(stamps[i]).getTime()).toBeGreaterThanOrEqual(new Date(stamps[i - 1]).getTime());
      }
    }
  });

  it('keeps every order date within [ANCHOR - 19d, ANCHOR]', () => {
    const state = generateSeedState();
    for (const order of state.orders) {
      const stamps = [
        order.createdAt,
        order.verifiedAt,
        order.transportingAt,
        order.deliveredAt,
        order.commissionPaidAt,
      ].filter((v): v is string => Boolean(v));

      for (const stamp of stamps) {
        const ms = new Date(stamp).getTime();
        expect(ms).toBeGreaterThanOrEqual(WINDOW_START_MS);
        expect(ms).toBeLessThanOrEqual(ANCHOR_MS);
      }
    }
  });
});

describe('generateSeedState — cart fulfillment', () => {
  it('never generates carts of 4+ items', () => {
    const state = generateSeedState();
    for (const order of state.orders) {
      expect(order.items.length).toBeGreaterThanOrEqual(1);
      expect(order.items.length).toBeLessThanOrEqual(3);
    }
  });

  it('reconstructs pre-decrement stock: final inventory quantities are all non-negative', () => {
    // Golden-rule invariant: since every order decremented its chosen
    // warehouse's stock at generation time (only from products it verified
    // were in stock), final inventory can never go negative.
    const state = generateSeedState();
    for (const entry of state.inventory) {
      expect(entry.quantity).toBeGreaterThanOrEqual(0);
    }
  });
});
