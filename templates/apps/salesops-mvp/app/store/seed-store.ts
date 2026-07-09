import type { Client, Order, OrderItem, PaymentInfo, SeedState } from '../domain/types';
import { cartTotalUSD } from '../domain/cart';
import { buildVerifiedTotals } from '../domain/verify';
import { generateSeedState } from '../seed/generate';
import { STORAGE_KEY, VERSION } from '../seed/constants';

export { STORAGE_KEY, VERSION };

/** Persists the full SeedState under the versioned localStorage key. */
export function saveSeedState(state: SeedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function readStoredState(): SeedState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SeedState;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Loads the persisted SeedState. If the key is missing or its `version`
 * doesn't match the current one, regenerates a fresh SeedState and persists
 * it under the current version before returning it.
 */
export function loadSeedState(): SeedState {
  const stored = readStoredState();
  if (stored) return stored;

  const fresh = generateSeedState();
  saveSeedState(fresh);
  return fresh;
}

/**
 * Clears the storage key and regenerates. Since `generateSeedState()` is
 * pure (fixed SEED/ANCHOR_ISO), the result is byte-identical to the very
 * first run.
 */
export function resetDemo(): SeedState {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = generateSeedState();
  saveSeedState(fresh);
  return fresh;
}

export interface CreateOrderInput {
  items: OrderItem[];
  client: Client;
  payment: PaymentInfo;
  warehouseId: string;
  gestorId: string;
  saleType?: string;
  observations?: string;
}

/**
 * Appends a new gestor-created `Order` (state `'creado'`) to the persisted
 * SeedState and returns it. The id is `order-user-${n}`, where `n` is the
 * count of existing `order-user-*` orders — NOT array length, since seeded
 * order ids are non-contiguous and would collide. `commissionMN`, `totalMN`,
 * and `exchangeRateSnapshot` are intentionally left unset; they are filled
 * in by later verification/commission stages.
 */
export function createOrder(input: CreateOrderInput, now: Date = new Date()): Order {
  const state = loadSeedState();
  const existingUserOrders = state.orders.filter((order) => order.id.startsWith('order-user-'));
  const id = `order-user-${existingUserOrders.length}`;

  const order: Order = {
    id,
    items: input.items,
    client: input.client,
    payment: input.payment,
    warehouseId: input.warehouseId,
    gestorId: input.gestorId,
    state: 'creado',
    totalUSD: cartTotalUSD(input.items),
    saleType: input.saleType,
    observations: input.observations,
    createdAt: now.toISOString(),
  };

  state.orders.push(order);
  saveSeedState(state);
  return order;
}

/**
 * Shared private read-modify-write helper for order state transitions:
 * loads the persisted state, finds the order by id (throws if missing),
 * runs `mutator` against it IN PLACE (may read `state` too, e.g. current
 * exchange rates), persists the whole state, and returns the updated order.
 * Generalizes to future transitions (transportando/entregado) without
 * re-solving persistence each time.
 */
function updateOrder(id: string, mutator: (order: Order, state: SeedState) => void): Order {
  const state = loadSeedState();
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new Error(`Order ${id} not found`);

  mutator(order, state);
  saveSeedState(state);
  return order;
}

/**
 * Transitions a `creado` order to `verificado`. Freezes the current
 * `state.exchangeRates.usdToMn` + `totalMN` + `commissionMN` via
 * `buildVerifiedTotals` (pure, mirrors the seed's own precedent) and stamps
 * `verifiedAt`. Throws if the order isn't in state `creado`. These frozen
 * fields are NEVER recomputed afterward — see `markCommissionPaid`.
 */
export function verifyOrder(id: string, now: Date = new Date()): Order {
  return updateOrder(id, (order, state) => {
    if (order.state !== 'creado') {
      throw new Error(`Order ${id} is not in state 'creado' (current: ${order.state})`);
    }

    const totals = buildVerifiedTotals(order.totalUSD, state.exchangeRates.usdToMn, order.items);
    order.exchangeRateSnapshot = totals.exchangeRateSnapshot;
    order.totalMN = totals.totalMN;
    order.commissionMN = totals.commissionMN;
    order.state = 'verificado';
    order.verifiedAt = now.toISOString();
  });
}

/**
 * Transitions a `verificado` order to `transportando`. Sets
 * `transportistaId` to the selected carrier's id and stamps
 * `transportingAt`. MUST NOT touch `exchangeRateSnapshot`, `totalMN`, or
 * `commissionMN` — those are frozen for good by `verifyOrder`. Throws if the
 * order isn't in state `verificado`.
 */
export function assignTransportista(id: string, transportistaId: string, now: Date = new Date()): Order {
  return updateOrder(id, (order) => {
    if (order.state !== 'verificado') {
      throw new Error(`Order ${id} is not in state 'verificado' (current: ${order.state})`);
    }

    order.transportistaId = transportistaId;
    order.state = 'transportando';
    order.transportingAt = now.toISOString();
  });
}

/**
 * Transitions a `transportando` order to `entregado` and stamps
 * `deliveredAt`. MUST NOT touch `exchangeRateSnapshot`, `totalMN`, or
 * `commissionMN` — those are frozen for good by `verifyOrder`. Throws if the
 * order isn't in state `transportando`.
 */
export function markDelivered(id: string, now: Date = new Date()): Order {
  return updateOrder(id, (order) => {
    if (order.state !== 'transportando') {
      throw new Error(`Order ${id} is not in state 'transportando' (current: ${order.state})`);
    }

    order.state = 'entregado';
    order.deliveredAt = now.toISOString();
  });
}

/**
 * Transitions an `entregado` order to `comision_pagada` and stamps
 * `commissionPaidAt`. MUST NOT touch `exchangeRateSnapshot`, `totalMN`, or
 * `commissionMN` — those are frozen for good by `verifyOrder`. Throws if the
 * order isn't in state `entregado`.
 */
export function markCommissionPaid(id: string, now: Date = new Date()): Order {
  return updateOrder(id, (order) => {
    if (order.state !== 'entregado') {
      throw new Error(`Order ${id} is not in state 'entregado' (current: ${order.state})`);
    }

    order.state = 'comision_pagada';
    order.commissionPaidAt = now.toISOString();
  });
}
