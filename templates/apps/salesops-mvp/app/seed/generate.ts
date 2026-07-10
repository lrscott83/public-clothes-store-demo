/**
 * Deterministic demo-data generator.
 *
 * `generateSeedState()` is a pure function of the frozen constants in
 * `./constants.ts` (SEED, ANCHOR_ISO, warehouse/gestor/transportista pools,
 * distributions) plus the static `../data/catalog.json` catalog. It NEVER
 * reads the wall clock or a non-deterministic RNG — every "random" draw goes
 * through the single `mulberry32(SEED)` generator created at the top of this
 * function, so two calls in the same process always produce byte-identical
 * output (see `app/seed/__tests__/generate.determinism.test.ts`, which also
 * statically greps every `app/seed/*.ts` file for the forbidden globals).
 *
 * Generation order matters:
 *   1. Inventory-first: seed 297 (product x warehouse) rows with PRNG-weighted
 *      stock (2-15, never 0).
 *   2. Order funnel, newest-to-oldest (offset 0 = ANCHOR_ISO, offset 19 =
 *      20 days earlier): each day draws 3-6 orders; each order picks a
 *      warehouse FIRST, then builds its cart only from products that
 *      warehouse currently has in stock (golden rule: a cart is always
 *      fulfillable from a single warehouse), decrementing stock immediately.
 *   3. Order state is drawn from a day-offset-weighted funnel; per-state
 *      timestamps are back-filled forward from `createdAt`, clamped so they
 *      never run past ANCHOR_ISO; rate snapshot/totals/commission populate
 *      only from `verificado` onward.
 */
import catalogData from '../data/catalog.json';
import type { CatalogData } from '@store-mgmt/storefront/catalog';
import type { InventoryEntry, Order, OrderItem, OrderState, SeedState, SeededProduct } from '../domain/types';
import {
  ANCHOR_ISO,
  CART_SIZE_WEIGHTS,
  CLIENT_NAME_POOL,
  DAY_MS,
  EXCHANGE_RATES,
  GESTORES,
  MAX_INVENTORY_QTY,
  MAX_ORDERS_PER_DAY,
  MIN_INVENTORY_QTY,
  MIN_ORDERS_PER_DAY,
  RATE_SNAPSHOT_POOL,
  SEED,
  STATE_FUNNEL_WEIGHTS,
  TRANSPORTISTAS,
  VERSION,
  WAREHOUSES,
  WINDOW_DAYS,
} from './constants';
import { enrichProducts, sumOrderCommission } from './enrich-products';
import { mulberry32 } from './prng';

const catalog = catalogData as CatalogData;

const STATE_ORDER: OrderState[] = ['creado', 'verificado', 'transportando', 'entregado', 'comision_pagada'];
type StampKey = 'verifiedAt' | 'transportingAt' | 'deliveredAt' | 'commissionPaidAt';
const STAMP_KEYS: StampKey[] = ['verifiedAt', 'transportingAt', 'deliveredAt', 'commissionPaidAt'];

function pickInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickWeighted<T extends { weight: number }>(rng: () => number, options: readonly T[]): T {
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  let roll = rng() * total;
  for (const option of options) {
    if (roll < option.weight) return option;
    roll -= option.weight;
  }
  return options[options.length - 1];
}

function pickWeightedState(rng: () => number, weights: Record<OrderState, number>): OrderState {
  const entries = STATE_ORDER.map((state) => ({ state, weight: weights[state] }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    if (roll < entry.weight) return entry.state;
    roll -= entry.weight;
  }
  return entries[entries.length - 1].state;
}

/** Fisher-Yates shuffle driven by the shared PRNG — deterministic per seed state. */
function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stateFunnelWeightsFor(offset: number): Record<OrderState, number> {
  const bucket = STATE_FUNNEL_WEIGHTS.find((entry) => offset <= entry.maxOffset);
  return (bucket ?? STATE_FUNNEL_WEIGHTS[STATE_FUNNEL_WEIGHTS.length - 1]).weights;
}

function inventoryKey(productId: string, warehouseId: string): string {
  return `${productId}:${warehouseId}`;
}

function seedInventory(
  rng: () => number,
  products: SeededProduct[],
): { inventory: InventoryEntry[]; stockIndex: Map<string, InventoryEntry> } {
  const inventory: InventoryEntry[] = [];
  const stockIndex = new Map<string, InventoryEntry>();

  for (const product of products) {
    for (const warehouse of WAREHOUSES) {
      const quantity = pickInt(rng, MIN_INVENTORY_QTY, MAX_INVENTORY_QTY);
      const entry: InventoryEntry = { productId: product.id, warehouseId: warehouse.id, quantity };
      inventory.push(entry);
      stockIndex.set(inventoryKey(product.id, warehouse.id), entry);
    }
  }

  return { inventory, stockIndex };
}

/** Back-fills per-state timestamps forward from `createdAt`, clamped to ANCHOR_ISO. */
function buildStateTimestamps(
  rng: () => number,
  createdAtMs: number,
  reachedIndex: number,
  anchorMs: number,
): Partial<Record<StampKey, string>> {
  const stamps: Partial<Record<StampKey, string>> = {};
  let cursorMs = createdAtMs;

  for (let step = 1; step <= reachedIndex; step++) {
    const minutesForward = pickInt(rng, 5, 240);
    cursorMs = Math.min(cursorMs + minutesForward * 60_000, anchorMs);
    stamps[STAMP_KEYS[step - 1]] = new Date(cursorMs).toISOString();
  }

  return stamps;
}

function buildOrder(
  rng: () => number,
  orderIndex: number,
  dayMs: number,
  anchorMs: number,
  products: SeededProduct[],
  stockIndex: Map<string, InventoryEntry>,
  stateWeights: Record<OrderState, number>,
): Order | null {
  const warehouse = WAREHOUSES[pickInt(rng, 0, WAREHOUSES.length - 1)];

  // Golden rule: the cart can only contain products this warehouse currently
  // has in stock — checked BEFORE any decrement.
  const available = products.filter(
    (product) => (stockIndex.get(inventoryKey(product.id, warehouse.id))?.quantity ?? 0) > 0,
  );
  if (available.length === 0) {
    return null; // warehouse fully depleted — skip this order slot
  }

  const desiredSize = pickWeighted(rng, CART_SIZE_WEIGHTS).size;
  const cartSize = Math.min(desiredSize, available.length, 3);
  const chosenProducts = shuffle(rng, available).slice(0, cartSize);

  const items: OrderItem[] = chosenProducts.map((product) => {
    const entry = stockIndex.get(inventoryKey(product.id, warehouse.id))!;
    entry.quantity -= 1; // decrement chosen warehouse stock immediately
    return {
      productId: product.id,
      quantity: 1,
      priceUSD: product.price,
      commissionMN: product.commissionMN,
    };
  });

  const totalUSD = items.reduce((sum, item) => sum + item.priceUSD * item.quantity, 0);
  const state = pickWeightedState(rng, stateWeights);
  const reachedIndex = STATE_ORDER.indexOf(state);

  const createdAtIso = new Date(dayMs).toISOString();
  const stamps = buildStateTimestamps(rng, dayMs, reachedIndex, anchorMs);

  const isVerifiedOrLater = reachedIndex >= 1;
  const exchangeRateSnapshot = isVerifiedOrLater
    ? { usdToMn: RATE_SNAPSHOT_POOL[pickInt(rng, 0, RATE_SNAPSHOT_POOL.length - 1)] }
    : undefined;
  const commissionMN = isVerifiedOrLater ? sumOrderCommission(items) : undefined;
  const totalMN =
    isVerifiedOrLater && exchangeRateSnapshot ? Math.round(totalUSD * exchangeRateSnapshot.usdToMn) : undefined;

  const clientName = CLIENT_NAME_POOL[pickInt(rng, 0, CLIENT_NAME_POOL.length - 1)];
  const gestor = GESTORES[pickInt(rng, 0, GESTORES.length - 1)];
  const transportista =
    reachedIndex >= 2 ? TRANSPORTISTAS[pickInt(rng, 0, TRANSPORTISTAS.length - 1)] : undefined;

  return {
    id: `order-${orderIndex}`,
    items,
    client: { id: `client-${orderIndex}`, name: clientName },
    payment: { method: 'USD' },
    warehouseId: warehouse.id,
    gestorId: gestor.id,
    transportistaId: transportista?.id,
    state,
    totalUSD,
    exchangeRateSnapshot,
    totalMN,
    commissionMN,
    createdAt: createdAtIso,
    ...stamps,
  };
}

export function generateSeedState(): SeedState {
  const rng = mulberry32(SEED);
  const products = enrichProducts(catalog);
  const { inventory, stockIndex } = seedInventory(rng, products);

  const anchorMs = new Date(ANCHOR_ISO).getTime();
  const orders: Order[] = [];
  let orderCounter = 0;

  for (let offset = 0; offset < WINDOW_DAYS; offset++) {
    const dayMs = anchorMs - offset * DAY_MS;
    const ordersToday = pickInt(rng, MIN_ORDERS_PER_DAY, MAX_ORDERS_PER_DAY);
    const stateWeights = stateFunnelWeightsFor(offset);

    for (let n = 0; n < ordersToday; n++) {
      orderCounter += 1;
      const order = buildOrder(rng, orderCounter, dayMs, anchorMs, products, stockIndex, stateWeights);
      if (order) {
        orders.push(order);
      }
    }
  }

  return {
    version: VERSION,
    generatedAt: ANCHOR_ISO,
    products,
    warehouses: WAREHOUSES,
    gestores: GESTORES,
    transportistas: TRANSPORTISTAS,
    inventory,
    exchangeRates: EXCHANGE_RATES,
    orders,
  };
}
