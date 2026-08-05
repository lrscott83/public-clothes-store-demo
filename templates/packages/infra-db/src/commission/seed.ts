/**
 * Commission reference seed.
 *
 * AMOUNTS come from `docs/plans/reference/04-commissions.md`, transcribed by
 * hand rather than parsed: the doc writes some as `10 000`, and a parser
 * reading that as `10` would set a payout twenty times too low with nothing to
 * notice it. KEYWORDS AND THEIR ORDER come from the prototype's
 * `commission-map.ts`, where they were authored against the real catalog and
 * then corrected twice by business review. The doc's headings are plural
 * category names ("Neveras", "TVs"); the catalog is singular and specific
 * ("Nevera 3.5P Milexus"). A table written in the doc's words matches almost
 * nothing — measured: 28 of 99 products, against 83 with these keywords.
 *
 * RESOLUTION ORDER, most specific first:
 *
 *   1. {@link KIT_TABLE} — named kits have their own tiers, well above the
 *      combo bracket. A kit reaching rule 3 would be paid as a two-item combo.
 *   2. {@link NAMED_BUNDLE_TABLE} — bundles the doc named and priced itself.
 *      Counting their pieces would overrule an amount the business wrote down.
 *   3. {@link COMBO_BRACKETS} — a product whose NAME joins several pieces with
 *      " + " is a combo, priced by how many it carries.
 *   4. {@link COMMISSION_KEYWORD_TABLE} — ordered keyword match.
 *   5. Nothing. No row is written; the line surfaces as unresolved.
 *
 * Rules 2 and 3 price a bundle SOLD AS ONE PRODUCT. The doc's bracket read as
 * an ORDER-level rule — N separate lines in one sale — is deliberately NOT
 * implemented: each line still earns its own tier.
 *
 * `Demás equipos pequeños | 1000` from the source doc is still NOT seeded as a
 * rule. It is a FALLBACK, and seeding it would price every unconfigured product
 * at 1000 — the "invent an amount" behaviour this module exists to prevent.
 * The small items it was meant to cover (freidoras, licuadoras, ollas…) instead
 * have EXPLICIT rows at that same amount. Same money, but configuration
 * somebody chose rather than a default nobody sees.
 *
 * `Cable | 50 por metro` and `Metro de azulejos | 500` are seeded as flat
 * per-unit amounts. That is correct only while those products' quantities are
 * expressed in metres — an assumption about catalog units, recorded here rather
 * than encoded as machinery.
 */

import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';

export interface CommissionReferenceRow {
  /**
   * Normalized keywords. A product matches this row if its normalized name
   * CONTAINS any of them.
   */
  readonly keywords: readonly string[];
  /** Whole MN units. Converted to decimal at write time. */
  readonly amountMn: number;
  /** Human label for the seed report — which rule fired, in words. */
  readonly label: string;
}

/**
 * ORDER ENCODES PRECEDENCE. First match wins. DO NOT SORT OR REORDER.
 *
 * This ordering is authored data, carried over from the prototype's
 * `commission-map.ts` where it was built and then corrected by business review.
 * It is not a heuristic and must not be replaced by one — an earlier attempt
 * here ranked candidates by "longest matching key", and that reconstruction got
 * three cases wrong that the ordering gets right:
 *
 *   - "Refrigerador Doble Puerta 16P" matched `puerta` (1000) instead of
 *     `refrigerador` (4000), because "puerta" happened to be the longer key.
 *   - "Base para Split" matched `split` (3000) — an accessory priced as a full
 *     air conditioner.
 *   - "Dispensador con Filtro de Agua" matched `filtro de agua` (1000) rather
 *     than `dispensador` (2000).
 *
 * The accessory rows below (`base para split`, `base ... tv`, `cajita`) sit
 * ABOVE the broad `tv` and `split` rows for exactly that reason — a bare `tv`
 * or `split` matches any product whose name merely mentions one. Moving them
 * reintroduces the bug.
 *
 * Amounts come from `docs/plans/reference/04-commissions.md`, hand-transcribed
 * (the doc writes some as `10 000`, and a parser reading that as `10` would set
 * a payout twenty times too low). Rows marked BUSINESS REVIEW are refinements
 * made after that doc was written and are not in it.
 */
/**
 * Combo brackets, from the source doc's `Combos de electrodomésticos` table.
 * Owner-confirmed 2026-07-30.
 *
 * A "combo" here is a CATALOG PRODUCT whose name joins several pieces with
 * " + " — `Smart TV 43" HD + Base Giratoria + Cajita HD` is three. The
 * commission is the bracket, not the sum of the parts and not the price of the
 * headline item.
 *
 * This is what a bundle needs and the keyword table cannot give it. Left to
 * keywords, those seven TV bundles matched `base de pared` — the accessory row
 * sits above `tv` on purpose, so a bare bracket is not paid as a television —
 * and a 3000 TV was being paid 500.
 *
 * Above 7 pieces the doc says nothing. Deliberately NOT extrapolated: the top
 * bracket is where the table stops, not where a pattern continues.
 */
export const COMBO_BRACKETS: readonly { readonly maxPieces: number; readonly amountMn: number }[] = [
  { maxPieces: 2, amountMn: 3000 },
  { maxPieces: 5, amountMn: 4000 },
  { maxPieces: 7, amountMn: 5000 },
];

/**
 * Named kits, resolved BEFORE the combo bracket. A kit's name also joins parts
 * with " + ", so without this it would be priced as a two-piece combo (3000)
 * instead of its own tier.
 *
 * The catalog's two kits are inverter-plus-battery packages, which the doc
 * prices as `Kit de batería e Inversor (incluye los TodoEnUno) | 8000`. Their
 * capacity-based names (`Kit 3.84KW`, `Kit 5.12KW`) match none of the doc's
 * `Kit N con M` labels, so the mapping is recorded here explicitly rather than
 * inferred from the numbers.
 */
export const KIT_TABLE: readonly CommissionReferenceRow[] = [
  { keywords: ['kit 3 con 5'], amountMn: 10000, label: 'Kit 3 con 5' },
  { keywords: ['kit 3 con 7'], amountMn: 12000, label: 'Kit 3 con 7' },
  { keywords: ['kit 5 con 10'], amountMn: 15000, label: 'Kit 5 con 10' },
  { keywords: ['kit 6 con 15'], amountMn: 18000, label: 'Kit 6 con 15' },
  { keywords: ['kit 10 con 16'], amountMn: 20000, label: 'Kit 10 con 16' },
  { keywords: ['kit 12 con 16'], amountMn: 20000, label: 'Kit 12 con 16' },
  { keywords: ['kit ecoflow'], amountMn: 7000, label: 'Kit Ecoflow' },
  { keywords: ['kit pecron'], amountMn: 7000, label: 'Kit Pecron' },
  { keywords: ['kit must 2 con 2 5'], amountMn: 7000, label: 'Kit Must 2 con 2.5' },
  // The two in this catalog. Both are inverter + battery.
  {
    keywords: ['kit 3 84', 'kit 5 12', 'kit de bateria e inversor', 'todoenuno'],
    amountMn: 8000,
    label: 'Kit de batería e Inversor',
  },
];

/**
 * Bundles the source doc NAMED and priced itself, checked before the bracket
 * and only for names that are bundles at all.
 *
 * The bracket prices a bundle by counting its pieces. That is the right rule
 * exactly where the business did not write one down — and the wrong one where
 * it did. `Fogón infrarrojo + olla de presión o calderos | 1500` joins two
 * pieces, so the bracket would pay 3000: twice the documented amount, decided
 * by a rule the business never applied to this product.
 */
export const NAMED_BUNDLE_TABLE: readonly CommissionReferenceRow[] = [
  {
    keywords: ['fogon infrarrojo'],
    amountMn: 1500,
    label: 'Fogón infrarrojo + olla de presión o calderos',
  },
];

export const COMMISSION_KEYWORD_TABLE: readonly CommissionReferenceRow[] = [
  // CORRECTION to the inherited ordering: "hidrolavadora" CONTAINS "lavadora",
  // so with the washing-machine rows first a pressure washer was priced as a
  // washing machine — 3000 instead of the 2000 the source table gives it. It
  // has to be resolved before them. Found by running the table against the
  // real 99-product catalog rather than against examples.
  { keywords: ['hidrolavadora'], amountMn: 2000, label: 'Hidrolavadora' },
  { keywords: ['lavadora semi'], amountMn: 3000, label: 'Lavadora semiautomática' },
  { keywords: ['lavadora automatica'], amountMn: 3000, label: 'Lavadora automática' },
  { keywords: ['lavadora secadora'], amountMn: 3000, label: 'Lavadora/Secadora' },
  { keywords: ['lavadora'], amountMn: 3000, label: 'Lavadora' },
  { keywords: ['cafetera de fogon'], amountMn: 500, label: 'Cafetera de fogón' },
  { keywords: ['maquina de cafe', 'expreso'], amountMn: 1000, label: 'Máquina de café expreso' },
  { keywords: ['cafetera'], amountMn: 500, label: 'Cafetera' },
  // BUSINESS REVIEW 2026-07-08: these three were falling through to a generic
  // fallback; they are large enough appliances to warrant their own tier.
  { keywords: ['cocina de induccion'], amountMn: 2000, label: 'Cocina de inducción' },
  { keywords: ['fogon de gas'], amountMn: 2000, label: 'Fogón de gas' },
  { keywords: ['cocina infrarroja'], amountMn: 2000, label: 'Cocina infrarroja' },
  { keywords: ['microondas'], amountMn: 2000, label: 'Microondas' },
  { keywords: ['contadora'], amountMn: 2000, label: 'Contadora' },
  { keywords: ['toldo'], amountMn: 2000, label: 'Toldos' },
  { keywords: ['escalera 6'], amountMn: 2000, label: 'Escalera 6 pasos' },
  { keywords: ['escalera 4', 'escalera'], amountMn: 1000, label: 'Escalera 4 pasos' },
  { keywords: ['bomba'], amountMn: 1000, label: 'Bomba de agua' },
  { keywords: ['calentador'], amountMn: 3000, label: 'Calentador de agua' },
  { keywords: ['inversor'], amountMn: 5000, label: 'Inversores' },
  { keywords: ['bateria'], amountMn: 5000, label: 'Baterías' },
  { keywords: ['panel solar'], amountMn: 1000, label: 'Panel Solar' },
  { keywords: ['base para paneles', 'base de paneles'], amountMn: 1000, label: 'Base de Paneles' },
  {
    keywords: ['lampara solar', 'luz recargable', 'recargable solar'],
    amountMn: 2000,
    label: 'Lámpara solar',
  },
  { keywords: ['lampara'], amountMn: 500, label: 'Lámparas' },
  // `20P` in a catalog name is 20 pies — the doc's `Exhibidor 20 pies | 5000`.
  // Without the `20p` form this fell through to the 13.77-pies tier at 4000.
  // `20P` in a catalog name is 20 pies. Kept anchored to `exhibidor`: a bare
  // `20p` would turn any 20-pie product into an exhibitor, and the exhibitor
  // rows sit above `refrigerador`/`nevera`.
  { keywords: ['exhibidor 20', 'exhibidor vertical 20'], amountMn: 5000, label: 'Exhibidor 20 pies' },
  { keywords: ['exhibidor'], amountMn: 4000, label: 'Exhibidor 13.77 pies' },
  { keywords: ['refrigerador'], amountMn: 4000, label: 'Refrigeradores' },
  { keywords: ['nevera'], amountMn: 3000, label: 'Neveras' },
  { keywords: ['dispensador'], amountMn: 2000, label: 'Dispensador de agua' },
  { keywords: ['filtro de agua'], amountMn: 1000, label: 'Filtro de agua' },
  {
    keywords: ['maquina de frio', 'maquina de refrigerador'],
    amountMn: 1000,
    label: 'Máquina de Refrigerador',
  },
  // BUSINESS REVIEW 2026-07-08: accessories were being swallowed by the broad
  // `tv`/`split` tiers below. These MUST stay above them.
  { keywords: ['base para split'], amountMn: 1000, label: 'Base para Split' },
  {
    keywords: ['base fija para tv', 'base para tv', 'base giratoria', 'base de pared'],
    amountMn: 500,
    label: 'Bases de TV',
  },
  { keywords: ['cajita'], amountMn: 1000, label: 'Cajita decodificadora' },
  { keywords: ['smart tv', 'tv'], amountMn: 3000, label: 'TVs' },
  { keywords: ['equipo de musica'], amountMn: 2000, label: 'Equipo de música LG' },
  { keywords: ['split'], amountMn: 3000, label: 'Split' },
  { keywords: ['ventilador industrial'], amountMn: 3000, label: 'Ventilador Industrial' },
  { keywords: ['ventilador de techo'], amountMn: 2000, label: 'Ventilador de techo' },
  { keywords: ['ventilador'], amountMn: 1000, label: 'Ventilador normal' },
  { keywords: ['fogon de petroleo'], amountMn: 500, label: 'Fogón de petróleo' },
  { keywords: ['fogon infrarrojo'], amountMn: 1500, label: 'Fogón infrarrojo + olla' },
  { keywords: ['fogon grande con horno'], amountMn: 3000, label: 'Fogón grande con horno' },
  { keywords: ['escritorio'], amountMn: 2000, label: 'Escritorio' },
  { keywords: ['bici moto'], amountMn: 5000, label: 'Bici-moto' },
  { keywords: ['bicicleta'], amountMn: 2000, label: 'Bicicleta' },
  { keywords: ['juego de muebles'], amountMn: 4000, label: 'Juego de muebles' },
  { keywords: ['juego de bano'], amountMn: 2000, label: 'Juego de Baño' },
  { keywords: ['bolsa de cemento'], amountMn: 100, label: 'Bolsa de Cemento' },
  { keywords: ['metro de azulejos', 'azulejo'], amountMn: 500, label: 'Metro de azulejos' },
  { keywords: ['colchon'], amountMn: 1500, label: 'Colchón' },
  { keywords: ['puerta'], amountMn: 1000, label: 'Puerta' },
  { keywords: ['silla'], amountMn: 1000, label: 'Silla' },
  { keywords: ['bocina'], amountMn: 1000, label: 'Bocina' },
  { keywords: ['secadora a vapor'], amountMn: 3000, label: 'Secadora a Vapor' },
  { keywords: ['horno electrico'], amountMn: 2000, label: 'Horno eléctrico' },
  { keywords: ['enfriador de aire grande'], amountMn: 2000, label: 'Enfriador de aire grande' },
  { keywords: ['enfriador de aire'], amountMn: 1000, label: 'Enfriador de aire pequeño' },
  { keywords: ['transfer'], amountMn: 1000, label: 'Transfer' },
  { keywords: ['estaciones solas', 'estacion sola'], amountMn: 5000, label: 'Estaciones solas' },
  { keywords: ['cable'], amountMn: 50, label: 'Cable (por metro)' },
  // Small kitchen equipment. The source doc lumps these under
  // `Demás equipos pequeños | 1000`, which is a fallback RULE — seeding it as
  // such would price EVERY unconfigured product at 1000. These are explicit
  // rows at the same amount instead: the money is identical, but each one is a
  // choice somebody made and can see, and a genuinely unknown product still
  // resolves to nothing.
  { keywords: ['freidora'], amountMn: 1000, label: 'Freidora de aire' },
  { keywords: ['licuadora'], amountMn: 1000, label: 'Licuadora' },
  { keywords: ['olla arrocera'], amountMn: 1000, label: 'Olla arrocera' },
  { keywords: ['olla de presion'], amountMn: 1000, label: 'Olla de presión' },
  { keywords: ['olla reina', 'olla'], amountMn: 1000, label: 'Olla' },
  { keywords: ['juego de calderos', 'caldero'], amountMn: 1000, label: 'Juego de calderos' },
  { keywords: ['sandwichera'], amountMn: 1000, label: 'Sandwichera' },
  { keywords: ['vajilla'], amountMn: 1000, label: 'Vajilla' },
  { keywords: ['galon de combustible'], amountMn: 1000, label: 'Galón de combustible' },
  // Last: the broadest accessory tier. Anything still merely "a base".
  { keywords: ['base'], amountMn: 500, label: 'Base (accesorio)' },
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
 * FIRST MATCH WINS, in table order. The order is the precedence decision, made
 * by a human who knew that "Base para Split" is a bracket and not an air
 * conditioner. That is strictly more expressive than any scoring rule derived
 * from the strings themselves, and — unlike a heuristic — it can be corrected
 * by editing one line and re-reading the diff.
 *
 * A product matched by NOTHING gets no row. It resolves to `undefined` at
 * runtime and surfaces as an unresolved accrual line: visible, fixable, and
 * never quietly worth zero.
 *
 * The seed refuses to run if the same keyword appears in two rows with
 * different amounts. Order resolves precedence between DIFFERENT keywords; it
 * cannot resolve a keyword that contradicts itself, and picking one would set
 * a person's pay by position in a list they never saw.
 */
/** How many pieces a bundle name joins with " + ". `1` means it is not a bundle. */
export function countComboPieces(rawName: string): number {
  return rawName.split(/\s+\+\s+/).length;
}

/**
 * Resolves ONE product, most specific first: named kit, then combo bracket,
 * then the ordered keyword table. `undefined` = nothing configured.
 *
 * Splitting on " + " happens against the RAW name, before normalization —
 * normalizing collapses the plus sign into a space and the bundle structure
 * disappears with it.
 */
function resolve(
  rawName: string,
  productKey: string,
  table: readonly CommissionReferenceRow[],
): { label: string; amountMn: number } | undefined {
  const kit = KIT_TABLE.find((row) =>
    row.keywords.some((keyword) => productKey.includes(normalizeName(keyword))),
  );
  if (kit) {
    return { label: kit.label, amountMn: kit.amountMn };
  }

  const pieces = countComboPieces(rawName);
  if (pieces > 1) {
    const named = NAMED_BUNDLE_TABLE.find((row) =>
      row.keywords.some((keyword) => productKey.includes(normalizeName(keyword))),
    );
    if (named) {
      return { label: named.label, amountMn: named.amountMn };
    }

    const bracket = COMBO_BRACKETS.find((b) => pieces <= b.maxPieces);
    // Beyond the top bracket the doc stops. A bundle of 8 is left to the
    // keyword table rather than extrapolated into a tier nobody wrote down.
    if (bracket) {
      return { label: `Combo de ${pieces} equipos`, amountMn: bracket.amountMn };
    }
  }

  const hit = table.find((row) =>
    row.keywords.some((keyword) => productKey.includes(normalizeName(keyword))),
  );
  return hit ? { label: hit.label, amountMn: hit.amountMn } : undefined;
}

export function buildCommissionAssignments(
  products: readonly SeedProduct[],
  table: readonly CommissionReferenceRow[] = COMMISSION_KEYWORD_TABLE,
): CommissionAssignmentReport {
  const seen = new Map<string, { label: string; amountMn: number }>();
  for (const row of table) {
    for (const keyword of row.keywords) {
      const key = normalizeName(keyword);
      const previous = seen.get(key);
      if (previous && previous.amountMn !== row.amountMn) {
        throw new AmbiguousCommissionReferenceError(
          `Keyword "${key}" appears twice with different amounts ` +
            `("${previous.label}" = ${previous.amountMn}, "${row.label}" = ${row.amountMn}). ` +
            'Resolve the table — the seed will not choose for you.',
        );
      }
      seen.set(key, { label: row.label, amountMn: row.amountMn });
    }
  }

  const matched: CommissionAssignment[] = [];
  const unmatchedProducts: SeedProduct[] = [];
  const usedLabels = new Set<string>();

  for (const product of products) {
    const productKey = normalizeName(product.name);
    const resolved = resolve(product.name, productKey, table);

    if (resolved) {
      matched.push({
        productId: product.id,
        productName: product.name,
        referenceName: resolved.label,
        amountMn: resolved.amountMn,
      });
      usedLabels.add(resolved.label);
    } else {
      unmatchedProducts.push(product);
    }
  }

  const unusedReferences = table
    .filter((row) => !usedLabels.has(row.label))
    .map((row) => row.label);

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
 *
 * `Product`/`ProductCommissionReference` are TENANT-side tables (design.md
 * §1) — takes the tenant client directly (task 14.2's retype off the
 * deleted legacy `PrismaService`). Still not wired into `prisma/seed.js` or
 * any caller — a pre-existing gap this batch does not close, flagged rather
 * than silently left inconsistent.
 */
export async function seedCommissionReferences(
  prisma: TenantPrismaClient,
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
