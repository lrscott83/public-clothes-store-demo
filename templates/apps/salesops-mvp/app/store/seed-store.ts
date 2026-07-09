import type { Client, Order, OrderItem, PaymentInfo, SeedState } from '../domain/types';
import { cartTotalUSD } from '../domain/cart';
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
