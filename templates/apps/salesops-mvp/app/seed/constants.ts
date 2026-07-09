import type { Gestor, Transportista, Warehouse } from '../domain/types';
import { hashSeed } from './prng';

/**
 * Frozen seed + anchor date. NEVER replace with the wall-clock or a
 * non-deterministic RNG — see `app/seed/generate.ts` header comment and the
 * static-guard test in `app/seed/__tests__/generate.determinism.test.ts`.
 */
export const SEED = hashSeed('salesops-mvp-demo-v1');
export const ANCHOR_ISO = '2026-07-10T12:00:00.000Z';

/** 20-day rolling window: offset 0 = ANCHOR (newest), offset 19 = oldest. */
export const WINDOW_DAYS = 20;
export const DAY_MS = 24 * 60 * 60 * 1000;

export const WAREHOUSES: Warehouse[] = [
  { id: 'wh-1', name: 'Nave Central' },
  { id: 'wh-2', name: 'Sucursal Este' },
  { id: 'wh-3', name: 'Sucursal Oeste' },
];

export const GESTORES: Gestor[] = [
  { id: 'gestor-1', name: 'Yasmani Alonso', phone: '+53 5123 4567' },
  { id: 'gestor-2', name: 'Liset Fonseca', phone: '+53 5234 5678' },
  { id: 'gestor-3', name: 'Reinier Castillo', phone: '+53 5345 6789' },
  { id: 'gestor-4', name: 'Dayana Herrera', phone: '+53 5456 7890' },
  { id: 'gestor-5', name: 'Maikel Suárez', phone: '+53 5567 8901' },
];

export const TRANSPORTISTAS: Transportista[] = [
  { id: 'transportista-1', name: 'Ernesto Junco' },
  { id: 'transportista-2', name: 'Yailin Pupo' },
  { id: 'transportista-3', name: 'Roberto Nápoles' },
];

/** Orders/day range (inclusive): PRNG-drawn 3-6. */
export const MIN_ORDERS_PER_DAY = 3;
export const MAX_ORDERS_PER_DAY = 6;

/**
 * Cart-size distribution (cumulative weights out of 100): 1 item 78%, 2 items
 * 20%, 3 items 2%. NEVER generate carts of 4+ items.
 */
export const CART_SIZE_WEIGHTS: Array<{ size: number; weight: number }> = [
  { size: 1, weight: 78 },
  { size: 2, weight: 20 },
  { size: 3, weight: 2 },
];

/** Inventory quantity/row: PRNG weighted 2-15, never 0. */
export const MIN_INVENTORY_QTY = 2;
export const MAX_INVENTORY_QTY = 15;

/** Exchange rates (current, editable later — Task 4/Pantalla 4, not here). */
export const EXCHANGE_RATES = {
  usdToMn: 680,
  zelle: 1,
  eur: 1,
};

/** Pool of possible frozen per-order rate snapshots (verificado+ orders). */
export const RATE_SNAPSHOT_POOL: number[] = [660, 670, 680, 690];

/** State funnel weights (out of 100) by day-offset bucket — see design.md. */
export const STATE_FUNNEL_WEIGHTS: Array<{
  maxOffset: number;
  weights: Record<'creado' | 'verificado' | 'transportando' | 'entregado' | 'comision_pagada', number>;
}> = [
  { maxOffset: 0, weights: { creado: 55, verificado: 35, transportando: 10, entregado: 0, comision_pagada: 0 } },
  { maxOffset: 3, weights: { creado: 20, verificado: 30, transportando: 25, entregado: 20, comision_pagada: 5 } },
  { maxOffset: 9, weights: { creado: 5, verificado: 15, transportando: 20, entregado: 35, comision_pagada: 25 } },
  { maxOffset: 19, weights: { creado: 0, verificado: 5, transportando: 10, entregado: 30, comision_pagada: 55 } },
];

/** 24-name client pool (design.md concrete defaults table). */
export const CLIENT_NAME_POOL: string[] = [
  'Ana Torres',
  'Luis Pérez',
  'Marta Gómez',
  'José Díaz',
  'Yanet Cruz',
  'Carlos Mena',
  'Dania Rojas',
  'Pedro Sánchez',
  'Elena Vega',
  'Raúl Blanco',
  'Mabel Soto',
  'Iván Reyes',
  'Tania Lima',
  'Osmany Ruiz',
  'Gladys Peña',
  'Frank Mora',
  'Yusimí Alba',
  'Damián León',
  'Noel Ferrer',
  'Odalys Prieto',
  'Ramón Cepero',
  'Yaidel Nores',
  'Suanys Roque',
  'Beatriz Ortega',
];

export const STORAGE_KEY = 'salesops-mvp:seed:v1';
export const VERSION = 1;
