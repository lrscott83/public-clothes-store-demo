# Design: Appliances Storefront Vertical

Change: `appliances-storefront` · Store: `hybrid` · Depends on: `proposal` (engram #621), `decisions` (engram #616)

## 0. Architecture summary

A **two-stage offline data pipeline** feeds an **additive vertical registration**. No
engine, component, or type changes — the design is grounded in the existing `clothes`
vertical, which is the proven blueprint (`verticals/clothes/store.config.ts` +
`catalog.json` + `public/verticals/clothes/products/**` + one line in `verticals.ts`).

```
assets/appliances/*.jpeg  (≈100 flyers, read-only source)
        │  Stage A — vision extraction (per-image, batched)
        ▼
extraction-dataset.json   (intermediate; taxonomy derived here)   ← HAND-OFF
        │  Stage B — rename/copy images     │  Stage C — generate catalog
        ▼                                   ▼
public/verticals/appliances/products/…   verticals/appliances/{catalog.json, store.config.ts}
        └───────────────┬───────────────────┘
                        ▼   Stage D — wire
              app/store/verticals.ts  (+1 import, +1 map entry)
```

Pattern: **ETL → static data provider**. The storefront already consumes a baked JSON
catalog through `createBakedCatalogProvider`; we only produce new data conforming to the
existing `StoreConfig` / `StoreProduct` contracts.

## 1. Intermediate dataset format (Stage A → Stage C hand-off)

**Location:** `openspec/changes/appliances-storefront/extraction-dataset.json` (change
provenance, NOT shipped in the app bundle). One JSON document:

```jsonc
{
  "schema_version": 1,
  "records": [
    {
      "source_filename": "WhatsApp Image 2026-07-03 at 9.25.38 AM (1).jpeg", // exact, incl. spaces/(1)
      "category": "neveras",          // Spanish kebab slug, from the derived taxonomy (§3)
      "name": "Nevera 5 pies",        // human product name (Spanish), printed or inferred from type+capacity
      "brand": "Milexus",             // string | null  (null when no brand printed; NOVA is NEVER a brand)
      "price_usd": 320,               // number | null  (USD, numeric only; null if no price printed)
      "capacity": "5 pies",           // string | null  (e.g. "5 pies", "12 kg", "1.5 ton")
      "voltage": "110V",              // string | null  ("110V" | "220V" | "110/220V")
      "color": "Gris",                // string | null
      "condition": "Garantía 30 días",// string | null  (verbatim warranty/condition phrase)
      "raw_text": "…full OCR dump…",  // string; everything legible, for auditing
      "notes": "second product on flyer ignored", // string | null; extractor rationale
      "needs_review": false           // boolean; true = do NOT auto-publish (see §2)
    }
  ],
  "taxonomy": [
    { "slug": "neveras", "name": "Neveras", "stem": "neveras", "count": 12 }
  ],
  "skipped": [
    { "source_filename": "…", "reason": "unreadable" }
  ]
}
```

Rules for the schema:
- Every source file resolves to exactly one of: a `records` entry, or a `skipped` entry.
- Fields `brand|price_usd|capacity|voltage|color|condition` are `null` when the datum is
  **not printed on that specific flyer**. Never carried over from a sibling image.
- `price_usd` is a plain number (strip `$`, `USD`, thousands separators).
- `raw_text` is mandatory and is the audit trail that lets Stage C be re-run deterministically.

## 2. OCR / extraction methodology & rules

**How the ~100 images are read:** batched multimodal `Read` calls (image input), ~8–12
flyers per batch to keep each response bounded, appending records to the dataset. Each
image is processed independently — no cross-image inference.

**Field rules:**
- **null-when-absent:** a field is populated only if legibly printed on that flyer;
  otherwise `null`. No invention, no defaults, no averaging from other flyers.
- **NOVA-is-not-brand:** "NOVA", "NOVA Tienda en línea", phone numbers, and Pinar del Río
  reseller chrome are seller branding, NOT product `brand`. Never emit them as `brand`,
  `name`, or catalog data. If the only "brand-looking" text is NOVA → `brand: null`.
- **price:** read the printed USD figure. If a flyer shows a struck-through/"antes" price
  plus a current price, current → `price_usd`, previous → captured in `raw_text`/`notes`
  (Stage C may map it to `originalPrice`, see §5).

**Edge-case policy (concrete):**
| Case | Action | Flag |
|---|---|---|
| **Unreadable flyer** (blurred/cropped, no legible product data) | add to `skipped[]` with `reason: "unreadable"`; not a record | — |
| **No price printed** | still emit a `record` (data preserved) but `price_usd: null` and `needs_review: true`; **excluded from published catalog** in v1 (a storefront product needs a price) | `needs_review` |
| **Multi-product flyer** | SPLIT only if each product has its own clearly-attributable price/specs → one record per product, all sharing the same `source_filename` (Stage B suffixes `-a`,`-b`). If specs can't be attributed per product → keep the **primary/largest** product, note the rest in `notes` | `notes` |
| **Ambiguous category** | pick the best-fit existing slug; if genuinely new, mint a slug (§3) and set `needs_review: true` so taxonomy is reviewed before publish | `needs_review` |
| **Ambiguous name only** | derive `name` from `type + capacity` (e.g. "Nevera 5 pies"); acceptable, not a review trigger | — |

`needs_review: true` records are retained in the intermediate dataset for provenance but
are **filtered out** by Stage C when generating `catalog.json` (v1 publishes only clean,
priced, categorized products). This keeps the shipped catalog honest without losing data.

## 3. Category taxonomy strategy (derived, not hardcoded)

The **full taxonomy is an output of Stage A, not an input.** The design deliberately does
NOT freeze the category list now — only after all ~100 flyers are read is the `taxonomy[]`
array finalized in the intermediate dataset.

Procedure:
1. During extraction, each record gets a working `category` slug.
2. After the full read, aggregate distinct slugs → `taxonomy[]`, attaching `count`.
3. **Merge rule:** collapse near-synonyms into one slug (e.g. `neveras` + `refrigeradores`
   → `neveras`; `luces-solares` + `lamparas-solares` → decide one, record the merge in
   `notes`). Drop any slug with `count === 0` after filtering `needs_review`.
4. Slug convention (matches `clothes`, VERIFIED): **Spanish, kebab-case, lowercase, no
   accents** (`neveras`, `ventiladores`, `lavadoras`, `luces-solares`,
   `inversores-solares`, `decodificadores`). Display `name`: Spanish Title Case, accents
   allowed (`Neveras`, `Luces Solares`, `Inversores Solares`).

Seed set observed in the 10-flyer sample (NOT authoritative — will be replaced by the
derived set): neveras/congeladores, ventiladores, lámparas/luces-solares, lavadoras,
decodificadores, inversores-solares. Final count TBD after full read.

## 4. Image naming + placement convention

- **Source:** `assets/appliances/*.jpeg` — copied, never moved/modified (v1 keeps NOVA
  overlay as-is, per decision #616).
- **Target:** `templates/apps/static-store/public/verticals/appliances/products/<slug>/<stem><index>.jpeg`
- **Stem rule (RESOLVED, see §8-D1):** `stem === slug` (whole slug, unchanged). Clothes
  used a singularized stem (`camisa` in `camisas/`), but appliances standardizes
  `stem = slug` to eliminate error-prone Spanish singularization
  (e.g. `neveras/neveras1.jpeg`, `luces-solares/luces-solares1.jpeg`).
- **Index:** 1-based, sequential **within category**, assigned in ascending
  `source_filename` order for determinism. Split products append the record's letter
  suffix to the source, not the target index (target stays sequential).
- **Extension:** `.jpeg` preserved (no conversion — source is JPEG).
- **catalog.json stores the vertical-relative key only** (`products/neveras/neveras1.jpeg`),
  never an absolute URL. `store.config.ts` wraps it with `verticalAsset('appliances', key)`
  → `/verticals/appliances/products/neveras/neveras1.jpeg`, base-path aware
  (`import.meta.env.BASE_URL`, threads `VITE_BASE` for GitHub Pages). This mirrors
  `clothes/store.config.ts` exactly.

## 5. Catalog mapping (record → StoreProduct)

`StoreProduct = { id, name, description, price, categoryId, image, images?, originalPrice?, isNew?, discount? }`

For each **published** record (has price, `needs_review === false`):
- `id`: **global sequential integer as string** (`"1"`, `"2"`, …), assigned in stable
  order `(slug asc, index asc)`. Guarantees uniqueness → satisfies `validateStoreConfig`
  and the `clothes-config` no-dup-ids regression test. `clothes` uses the same string-int
  scheme.
- `name`: record `name`.
- `price`: record `price_usd` (number).
- `categoryId`: record `category` slug (must exist in `categories[]` — integrity enforced
  by validator + test).
- `image`: vertical-relative key from §4.
- `description`: **folded specs** — join present fields with `" · "` in fixed order:
  `Marca: {brand}` · `{capacity}` · `{voltage}` · `Color: {color}` · `{condition}`.
  Omit any null field. Example: `"Marca: Milexus · 5 pies · 110V · Color: Gris · Garantía 30 días"`.
  If all spec fields are null → `description = ""` is invalid UX; fall back to the category
  display name (e.g. `"Nevera"`). Never invent specs.
- `originalPrice` / `discount`: set ONLY when the flyer printed a previous price and it is
  strictly greater than `price` (validator rejects `originalPrice <= price`). Otherwise omit.
- `isNew`, `images`: omitted in v1 (single image per product, no "new" signal in source).

`categories[]` built directly from the finalized `taxonomy[]` (`{ id: slug, name }`),
ordered by slug asc (optional `order` omitted, matching clothes).

## 6. Vertical wiring (exact edits, zero engine changes)

**New file** `verticals/appliances/store.config.ts` — copy the `clothes` shape verbatim,
changing only vertical-specific data:
- `import catalogData from './catalog.json'`; map `image` via `verticalAsset('appliances', product.image)` (identical map block to clothes lines 22–28).
- `vertical: 'appliances'`, `locale: 'en-US'`, `currency: 'USD'` (per #616).
- `brand`, `hero`, `nav`, `features`, `footer`: appliance-appropriate Spanish copy
  (NOVA-neutral store branding — do NOT surface the reseller name as the store brand
  unless the user wants it). `theme`: reuse a valid palette (clothes palette is fine as a
  starting theme; not a blocker).
- `hero.image`: `verticalAsset('appliances', 'hero.jpg')` — requires one hero asset placed
  at `public/verticals/appliances/hero.jpg` (reuse a representative flyer or a neutral
  banner). Required by `validateStoreConfig` (`hero.image` non-blank) and asserted by the
  config test.

**Modified file** `app/store/verticals.ts` — exactly two lines:
```ts
import { appliancesConfig } from '../../verticals/appliances/store.config';
// …
appliances: { slug: 'appliances', config: appliancesConfig },
```

**New generated file** `verticals/appliances/catalog.json` — `{ categories, products }`.

No changes to `packages/storefront/**` (types, provider, asset helper, validator all reused).

## 7. Build / verify approach

1. **Config unit test (primary image-resolution gate):** add
   `verticals/__tests__/appliances-config.test.ts`, mirroring `clothes-config.test.ts`:
   - `validateStoreConfig(appliancesConfig)` does not throw (required fields, unique ids,
     categoryId integrity, `originalPrice > price`).
   - `assertAssetExists` for `hero.image` and **every** `product.image` → proves each
     referenced file physically exists under `public/verticals/appliances/`. This is the
     "every product image resolves" guarantee.
   - assert `products.length` / `categories.length` equal the finalized counts (guards
     against silent data loss).
   Run: `npm test` inside `templates/apps/static-store` (= `vitest run`), or via turbo
   `turbo run test --filter @store-mgmt/static-store`. **Strict TDD:** write this test
   first (red) against the not-yet-generated config, then generate data to green.
2. **Render/prerender gate:** `npm run build` (`react-router build`) inside the app must
   succeed — prerendering resolves `VERTICALS.appliances.config` at build time in Node
   (why static import is mandatory, per verticals.ts comment). A broken import or missing
   asset key fails the build.
3. **Manual smoke (optional):** `npm run dev` → visit the appliances route, confirm hero +
   product grid + category filter render.
4. **Orphan check:** assert no file under `public/verticals/appliances/products/**` is
   unreferenced by `catalog.json` (catches rename/index drift). Can be a second `it()` in
   the config test.

## 8. Open decisions resolved here (ADR-style)

- **D1 — image stem = full slug (not singularized).** *Alt rejected:* mirror clothes'
  singular stem (`nevera` in `neveras/`). *Rationale:* Spanish singularization is
  irregular (`luces`→`luz`, `inversores`→`inversor`) and would need a per-category lookup;
  `stem = slug` is a pure, deterministic function of the slug with zero ambiguity. Both are
  equally valid to the asset resolver (it only concatenates a key), so determinism wins.
- **D2 — price-less products excluded from v1 catalog.** *Alt rejected:* publish with
  `price: 0` or a placeholder. *Rationale:* `0` is misleading commerce data and violates
  the "no invented data" principle; the record is preserved (`needs_review`) so it can be
  priced later. A storefront product without a price is not sellable.
- **D3 — intermediate dataset lives in the change folder, not the app bundle.** *Rationale:*
  it's provenance/audit, not runtime data; shipping it would bloat the client and duplicate
  `catalog.json`.
- **D4 — multi-product flyers split only with per-product prices.** *Rationale:* splitting
  without attributable price/specs would fabricate data; primary-product fallback keeps the
  catalog truthful.
- **D5 — global integer product ids.** *Alt rejected:* `slug-index` composite ids. *Rationale:*
  matches the existing clothes scheme and the validator/test expectations; simplest unique
  key.
- **D6 — NOVA-neutral store brand.** The store's own `brand.name` must not present the NOVA
  reseller as if it were the product line; kept generic pending user preference. Flagged for
  the user in the proposal/spec.

## 9. Risks / assumptions

- Taxonomy count and final product count are unknown until Stage A completes; the config
  test's count assertions must be filled in **after** generation, not before.
- Vision OCR accuracy on low-quality flyers → `needs_review` + `skipped[]` bound the blast
  radius; unreadable images degrade gracefully instead of injecting bad data.
- `hero.jpg` has no dedicated source asset; assumes reusing a flyer or neutral banner is
  acceptable (validator only needs a resolvable non-blank image).
- Assumes the ~100 sources are all product flyers (not stray reseller/contact cards); any
  non-product image lands in `skipped[]`.
