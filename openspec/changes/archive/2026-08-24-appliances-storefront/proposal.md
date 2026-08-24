# Proposal: Appliances Storefront Vertical

## Intent

We have ~100 real appliance flyer images (`assets/appliances/`, NOVA reseller,
Cuban/Pinar del Río market) with printed price/brand/specs but no storefront to
sell them. The `template_migration` branch already ships a themeable vertical
system proven to onboard a new store with zero engine changes. This change turns
that raw image set into a live **appliances** vertical, reusing the template.

## Scope

### In Scope — 4-stage pipeline

- **(a) Vision-read + categorize.** Read every one of the ~100 flyers; extract only
  printed data (name, brand, price USD, capacity/size, voltage, color, condition)
  into a structured intermediate JSON dataset + finalized category taxonomy.
- **(b) Rename + organize images.** Copy each flyer to
  `public/verticals/appliances/products/<category-slug>/<category-slug><index>.jpeg`
  (sequential index), matching the clothes convention. Sources kept as-is.
- **(c) Generate catalog.** Transform the intermediate dataset into
  `verticals/appliances/catalog.json` (categories + products), folding specs into
  `description`, plus `verticals/appliances/store.config.ts`.
- **(d) Wire the vertical.** Add `appliances` to `verticals.ts` so the route renders.

### Out of Scope

- Image cropping / NOVA-brand removal (images used as-is for v1).
- Prices/specs beyond what a flyer prints; no invented data.
- Backend, checkout, inventory, `StoreProduct` type extension.

## Capabilities

### New Capabilities
- `appliances-catalog`: the appliances product/category dataset + config vertical.

### Modified Capabilities
- None.

## Approach & Key Decisions

- **Option B** (templates turborepo new vertical) — confirmed. Zero engine changes.
- **Category slugs: SPANISH kebab-case** (`neveras`, `ventiladores`, `lavadoras`).
  Verified `clothes` uses Spanish slugs (`botas-hombres`, `camisas`) with Spanish
  display names; content language matches the market. English slugs REJECTED.
- **Specs → `description`.** `StoreProduct` has no brand/capacity/voltage fields;
  encode as formatted text (e.g. "Marca: Milexus · 5.5P · 110V"). No type change.
- **Locale `en-US`, currency `USD`** — matches current `clothes` config and flyer $USD.
- **Data flow:** intermediate JSON (stage a) → `catalog.json` (stage c) →
  `store.config.ts` maps `image` via `verticalAsset('appliances', ...)`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/store/verticals.ts` | Modified | +1 import, +1 map entry |
| `verticals/appliances/store.config.ts` | New | Brand/theme/locale/nav/catalog |
| `verticals/appliances/catalog.json` | New | Generated categories + products |
| `public/verticals/appliances/products/**` | New | Renamed flyer images |
| `assets/appliances/*.jpeg` | Read | Source flyers (vision-read) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| OCR/flyer text inconsistent across ~100 images | High | Per-image extraction; field null only if absent; spec defines fallback |
| Category count unknown until full read | Med | Stage (a) finalizes taxonomy before renaming |
| Flyer shows 2+ products or is unreadable | Med | Design rule: split, pick primary, or skip + log |
| "NOVA" reseller mistaken for brand | Med | Exclude reseller name during extraction |

## Rollback Plan

Delete `verticals/appliances/` + `public/verticals/appliances/` and revert the
single `verticals.ts` line. No shared engine/type code touched, so removal is clean.

## Success Criteria

- [ ] All ~100 flyers read; intermediate dataset + taxonomy finalized.
- [ ] Images renamed/organized under `public/verticals/appliances/products/`.
- [ ] `catalog.json` + `store.config.ts` generated; only printed data, no invented fields.
- [ ] `appliances` route renders the catalog end-to-end.
