import type { PrismaService } from '../prisma-client.js';

/**
 * Commission reference seed.
 *
 * The table below is a HAND transcription of `docs/plans/reference/04-commissions.md`.
 * Hand, not parsed: the source doc writes some amounts with thousands spaces
 * (`10 000`), and a parser that silently read one of those as `10` would set a
 * payout twenty times too low with nothing to notice it. A human resolving them
 * once, in a reviewed diff, is the safer boundary.
 *
 * TWO GROUPS FROM THE SOURCE DOC ARE DELIBERATELY ABSENT:
 *
 *  - `Demás equipos pequeños | 1000` — a FALLBACK RULE, not a product. Seeding
 *    it would price every unconfigured item at 1000, which is exactly the
 *    "invent an amount" behaviour this module exists to prevent. An
 *    unconfigured product must stay unresolved and visible.
 *
 *  - `Combos de electrodomésticos` (1-2 / 3-5 / 6-7 equipos) — an ORDER-LEVEL
 *    bracket, computed from how many items a sale carries. It cannot be
 *    expressed in a per-product table, and approximating it here would be a
 *    guess wearing the costume of configuration. Left pending, on purpose.
 *
 * `Cable | 50 por metro` and `Metro de azulejos | 500` are seeded as flat
 * per-unit amounts. That is correct only while those products' quantities are
 * expressed in metres — an assumption about catalog units, recorded here rather
 * than encoded as machinery.
 */

export interface CommissionReferenceRow {
  readonly name: string;
  /** Whole MN units, as written in the source table. Converted to decimal at write time. */
  readonly amountMn: number;
}

export const COMMISSION_REFERENCE_TABLE: readonly CommissionReferenceRow[] = [
  // Electrodomésticos y equipos
  { name: 'Toldos', amountMn: 2000 },
  { name: 'Contadora', amountMn: 2000 },
  { name: 'Escalera 6 pasos', amountMn: 2000 },
  { name: 'Escalera 4 pasos', amountMn: 1000 },
  { name: 'Filtro de agua', amountMn: 1000 },
  { name: 'Horno eléctrico', amountMn: 2000 },
  { name: 'Refrigeradores', amountMn: 4000 },
  { name: 'Neveras', amountMn: 3000 },
  { name: 'Calentadores de agua', amountMn: 3000 },
  { name: 'Juego de muebles', amountMn: 4000 },
  { name: 'TVs', amountMn: 3000 },
  // Same amount as the plural row above, different normalized key — both kept.
  // Had the two amounts differed, `buildCommissionAssignments` would refuse to
  // seed rather than pick one.
  { name: 'Calentador de agua', amountMn: 3000 },
  { name: 'Microondas', amountMn: 2000 },
  { name: 'Lavadora semiautomática', amountMn: 3000 },
  { name: 'Hidrolavadora', amountMn: 2000 },
  { name: 'Lavadora automática', amountMn: 3000 },
  { name: 'Lámparas', amountMn: 500 },
  { name: 'Cafetera de Fogón', amountMn: 500 },
  { name: 'Fogón infrarrojo + olla de presión o calderos', amountMn: 1500 },
  { name: 'Split', amountMn: 3000 },
  { name: 'Bocina', amountMn: 1000 },
  { name: 'Fogón grande con horno', amountMn: 3000 },
  { name: 'Secadora a Vapor', amountMn: 3000 },
  { name: 'Neveras de 16 y 20 pies', amountMn: 4000 },
  { name: 'Exhibidor 13.77 pies', amountMn: 4000 },
  { name: 'Exhibidor 20 pies', amountMn: 5000 },
  { name: 'Ventilador de techo', amountMn: 2000 },
  { name: 'Bomba de agua', amountMn: 1000 },
  { name: 'Dispensador de agua', amountMn: 2000 },
  { name: 'Fogón de petróleo', amountMn: 500 },
  { name: 'Bici-moto', amountMn: 5000 },
  { name: 'Juego de Baño', amountMn: 2000 },
  { name: 'Bolsa de Cemento', amountMn: 100 },
  { name: 'Máquina de Refrigerador', amountMn: 1000 },
  { name: 'Metro de azulejos', amountMn: 500 },
  { name: 'Colchón', amountMn: 1500 },
  { name: 'Puerta', amountMn: 1000 },
  { name: 'Bases de TV', amountMn: 500 },
  { name: 'Ventilador Industrial', amountMn: 3000 },
  { name: 'Ventilador normal', amountMn: 1000 },
  { name: 'Silla', amountMn: 1000 },
  { name: 'Escritorio', amountMn: 2000 },
  { name: 'Bicicleta', amountMn: 2000 },
  { name: 'Equipo de música LG', amountMn: 2000 },
  { name: 'Lámpara 60w', amountMn: 500 },
  { name: 'Lámpara solar', amountMn: 2000 },
  { name: 'Enfriador de aire pequeño', amountMn: 1000 },
  { name: 'Enfriador de aire grande', amountMn: 2000 },
  { name: 'Máquina de café expreso', amountMn: 1000 },

  // Energía solar (componentes)
  { name: 'Panel Solar', amountMn: 1000 },
  { name: 'Transfer', amountMn: 1000 },
  { name: 'Base de Paneles', amountMn: 1000 },
  // "50 por metro" in the source — flat per unit. See the module note.
  { name: 'Cable', amountMn: 50 },
  { name: 'Baterías', amountMn: 5000 },
  { name: 'Inversores', amountMn: 5000 },
  { name: 'Estaciones solas', amountMn: 5000 },

  // Kits de energía — ordinary catalog products, same per-product path.
  // Thousands spaces in the source resolved here, by hand.
  { name: 'Kit de batería e Inversor (incluye los TodoEnUno)', amountMn: 8000 },
  { name: 'Kit 3 con 5', amountMn: 10000 },
  { name: 'Kit 3 con 7', amountMn: 12000 },
  { name: 'Kit 5 con 10', amountMn: 15000 },
  { name: 'Kit 6 con 15', amountMn: 18000 },
  { name: 'Kit 10 con 16', amountMn: 20000 },
  { name: 'Kit 12 con 16', amountMn: 20000 },
  { name: 'Kit Ecoflow', amountMn: 7000 },
  { name: 'Kit Pecron', amountMn: 7000 },
  { name: 'Kit Must 2 con 2.5', amountMn: 7000 },
];

/**
 * NFD, strip diacritics, lowercase, collapse everything non-alphanumeric to a
 * single space. Carried over verbatim from the MVP — the only piece of its
 * commission machinery worth keeping, and moved to seed time where a wrong
 * match becomes a line in a report a human reads instead of a silent payout.
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface SeedProduct {
  readonly id: string;
  readonly name: string;
}

export interface CommissionAssignment {
  readonly productId: string;
  readonly productName: string;
  readonly referenceName: string;
  readonly amountMn: number;
}

export interface CommissionAssignmentReport {
  readonly matched: readonly CommissionAssignment[];
  readonly unmatchedProducts: readonly SeedProduct[];
  /** Reference rows that matched nothing — stale or aspirational catalog data, surfaced not hidden. */
  readonly unusedReferences: readonly string[];
}

/** Thrown when the table cannot be resolved without guessing. Aborts the seed. */
export class AmbiguousCommissionReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousCommissionReferenceError';
  }
}

/**
 * PURE. Decides which product gets which amount.
 *
 * 1. Exact normalized-name match wins outright.
 * 2. Otherwise the LONGEST reference key that appears as a substring wins —
 *    "Neveras de 16 y 20 pies" beats "Neveras" for a 16-pie model.
 * 3. A tie between two different keys of equal length, or two rows sharing a
 *    key but disagreeing on the amount, THROWS. Neither can be resolved
 *    honestly, and picking one would set a person's pay arbitrarily.
 * 4. A product nothing matches gets NO row. It resolves to `undefined` at
 *    runtime and surfaces as an unresolved accrual line.
 */
export function buildCommissionAssignments(
  products: readonly SeedProduct[],
  table: readonly CommissionReferenceRow[] = COMMISSION_REFERENCE_TABLE,
): CommissionAssignmentReport {
  const byKey = new Map<string, { name: string; amountMn: number }>();
  for (const row of table) {
    const key = normalizeName(row.name);
    const existing = byKey.get(key);
    if (existing && existing.amountMn !== row.amountMn) {
      throw new AmbiguousCommissionReferenceError(
        `Commission reference "${key}" is defined twice with different amounts ` +
          `(${existing.name} = ${existing.amountMn}, ${row.name} = ${row.amountMn}). ` +
          'Resolve the source table — the seed will not choose for you.',
      );
    }
    byKey.set(key, { name: row.name, amountMn: row.amountMn });
  }

  const matched: CommissionAssignment[] = [];
  const unmatchedProducts: SeedProduct[] = [];
  const usedKeys = new Set<string>();

  for (const product of products) {
    const productKey = normalizeName(product.name);

    const exact = byKey.get(productKey);
    if (exact) {
      matched.push({
        productId: product.id,
        productName: product.name,
        referenceName: exact.name,
        amountMn: exact.amountMn,
      });
      usedKeys.add(productKey);
      continue;
    }

    let best: { key: string; name: string; amountMn: number } | undefined;
    let tiedWith: string | undefined;
    for (const [key, entry] of byKey) {
      if (!productKey.includes(key)) {
        continue;
      }
      if (best === undefined || key.length > best.key.length) {
        best = { key, name: entry.name, amountMn: entry.amountMn };
        tiedWith = undefined;
      } else if (key.length === best.key.length && entry.amountMn !== best.amountMn) {
        tiedWith = entry.name;
      }
    }

    if (best && tiedWith) {
      throw new AmbiguousCommissionReferenceError(
        `Product "${product.name}" matches two references of equal length with different amounts ` +
          `("${best.name}" = ${best.amountMn}, "${tiedWith}"). This is an ambiguous tie — ` +
          'disambiguate the source table or the product name.',
      );
    }

    if (best) {
      matched.push({
        productId: product.id,
        productName: product.name,
        referenceName: best.name,
        amountMn: best.amountMn,
      });
      usedKeys.add(best.key);
    } else {
      unmatchedProducts.push(product);
    }
  }

  const unusedReferences = [...byKey.entries()]
    .filter(([key]) => !usedKeys.has(key))
    .map(([, entry]) => entry.name);

  return { matched, unmatchedProducts, unusedReferences };
}

export interface SeedCommissionResult extends CommissionAssignmentReport {
  readonly referencesWritten: number;
}

/**
 * Idempotent. Upserts one reference row per matched product and prints the
 * report the design requires: what matched, what did not, what went unused.
 * Throws before writing anything if the table is ambiguous — a partially
 * seeded commission table is worse than none.
 */
export async function seedCommissionReferences(
  prisma: PrismaService,
): Promise<SeedCommissionResult> {
  const products = await prisma.product.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const report = buildCommissionAssignments(products);

  for (const assignment of report.matched) {
    const amount = assignment.amountMn.toFixed(2);
    await prisma.productCommissionReference.upsert({
      where: { productId: assignment.productId },
      update: { amountMn: amount },
      create: { productId: assignment.productId, amountMn: amount },
    });
  }

  return { ...report, referencesWritten: report.matched.length };
}
