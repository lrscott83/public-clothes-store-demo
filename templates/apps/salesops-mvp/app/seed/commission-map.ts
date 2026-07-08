/**
 * Product name -> commissionMN derivation. Pure, no PRNG, no side effects.
 *
 * Resolution order (first match wins — see design.md "Commission dictionary"):
 *   1. Bundle pre-check: name contains " + " -> split, resolve each segment
 *      independently, sum the results (`bundle-sum`).
 *   2. Ordered keyword table (41 entries, most specific first) (`keyword`).
 *   3. Per-category default (`category-default`).
 *   4. 1000 catch-all (`catch-all`).
 */

export type CommissionRule = 'keyword' | 'category-default' | 'catch-all' | 'bundle-sum';

export interface CommissionResult {
  commissionMN: number;
  rule: CommissionRule;
}

/** Lowercase, strip accents/diacritics, collapse punctuation/quotes/whitespace. */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

interface KeywordEntry {
  keywords: string[];
  commissionMN: number;
}

/** Ordered keyword -> MN table. Order encodes precedence — DO NOT sort/reorder. */
export const KEYWORD_COMMISSIONS: KeywordEntry[] = [
  { keywords: ['lavadora semi'], commissionMN: 3000 },
  { keywords: ['lavadora automatica'], commissionMN: 3000 },
  { keywords: ['lavadora secadora'], commissionMN: 3000 },
  { keywords: ['lavadora'], commissionMN: 3000 },
  { keywords: ['cafetera de fogon'], commissionMN: 500 },
  { keywords: ['maquina de cafe', 'expreso'], commissionMN: 1000 },
  { keywords: ['cafetera'], commissionMN: 500 },
  // 2026-07-08 business review: these 3 cooktop/stove models were falling
  // through to the `cocinas` category default (1000) — they're large enough
  // appliances to warrant their own 2000 tier, ahead of any generic fallback.
  { keywords: ['cocina de induccion'], commissionMN: 2000 },
  { keywords: ['fogon de gas'], commissionMN: 2000 },
  { keywords: ['cocina infrarroja'], commissionMN: 2000 },
  { keywords: ['microondas'], commissionMN: 2000 },
  { keywords: ['hidrolavadora'], commissionMN: 2000 },
  { keywords: ['contadora'], commissionMN: 2000 },
  { keywords: ['toldo'], commissionMN: 2000 },
  { keywords: ['escalera 6'], commissionMN: 2000 },
  { keywords: ['escalera 4', 'escalera'], commissionMN: 1000 },
  { keywords: ['bomba'], commissionMN: 1000 },
  { keywords: ['calentador'], commissionMN: 3000 },
  { keywords: ['inversor'], commissionMN: 5000 },
  { keywords: ['bateria'], commissionMN: 5000 },
  { keywords: ['panel solar'], commissionMN: 1000 },
  { keywords: ['base para paneles', 'base de paneles'], commissionMN: 1000 },
  { keywords: ['lampara solar', 'luz recargable', 'recargable solar'], commissionMN: 2000 },
  { keywords: ['lampara'], commissionMN: 500 },
  { keywords: ['exhibidor 20'], commissionMN: 5000 },
  { keywords: ['exhibidor'], commissionMN: 4000 },
  { keywords: ['refrigerador'], commissionMN: 4000 },
  { keywords: ['nevera'], commissionMN: 3000 },
  { keywords: ['dispensador'], commissionMN: 2000 },
  { keywords: ['filtro de agua'], commissionMN: 1000 },
  { keywords: ['maquina de frio', 'maquina de refrigerador'], commissionMN: 1000 },
  // 2026-07-08 business review: TV/split *accessories* (bases, cajitas) were
  // being swallowed by the broad "tv" / "split" tiers below — bare `tv` and
  // `split` match ANY product whose name merely mentions a TV or a split,
  // including accessory names. These more specific tiers MUST be checked
  // first so an accessory doesn't get priced like the full appliance.
  { keywords: ['base para split'], commissionMN: 1000 },
  {
    keywords: ['base fija para tv', 'base para tv', 'base giratoria', 'base de pared'],
    commissionMN: 500,
  },
  { keywords: ['cajita'], commissionMN: 1000 },
  { keywords: ['smart tv', 'tv'], commissionMN: 3000 },
  { keywords: ['equipo de musica'], commissionMN: 2000 },
  { keywords: ['split'], commissionMN: 3000 },
  { keywords: ['ventilador industrial'], commissionMN: 3000 },
  { keywords: ['ventilador de techo'], commissionMN: 2000 },
  { keywords: ['ventilador'], commissionMN: 1000 },
  { keywords: ['fogon de petroleo'], commissionMN: 500 },
  { keywords: ['fogon infrarrojo'], commissionMN: 1500 },
  { keywords: ['fogon grande con horno'], commissionMN: 3000 },
  { keywords: ['escritorio'], commissionMN: 2000 },
  { keywords: ['base'], commissionMN: 500 },
];

/** Per-category defaults, used when no keyword matches. */
export const CATEGORY_DEFAULTS: Record<string, number> = {
  cafeteras: 500,
  climatizacion: 3000,
  cocinas: 1000,
  'energia-solar': 1000,
  freidoras: 1000,
  lavadoras: 3000,
  licuadoras: 1000,
  ollas: 1000,
  refrigeracion: 4000,
  'tv-y-audio': 3000,
  utiles: 1000,
};

/** Final fallback when neither a keyword nor a category default apply. */
export const CATCH_ALL = 1000;

function deriveSingleSegment(name: string, category: string): CommissionResult {
  const normalized = normalizeName(name);

  for (const entry of KEYWORD_COMMISSIONS) {
    if (entry.keywords.some((keyword) => normalized.includes(keyword))) {
      return { commissionMN: entry.commissionMN, rule: 'keyword' };
    }
  }

  const categoryDefault = CATEGORY_DEFAULTS[category];
  if (categoryDefault !== undefined) {
    return { commissionMN: categoryDefault, rule: 'category-default' };
  }

  return { commissionMN: CATCH_ALL, rule: 'catch-all' };
}

/**
 * Resolves the commissionMN + firing rule for a raw product name + category.
 * Bundle names (joined by literal " + ") are split and resolved segment by
 * segment BEFORE punctuation normalization, then summed.
 */
export function deriveCommission(name: string, category: string): CommissionResult {
  const bundleSegments = name.split(/\s+\+\s+/);

  if (bundleSegments.length > 1) {
    const commissionMN = bundleSegments.reduce(
      (sum, segment) => sum + deriveSingleSegment(segment, category).commissionMN,
      0,
    );
    return { commissionMN, rule: 'bundle-sum' };
  }

  return deriveSingleSegment(name, category);
}
