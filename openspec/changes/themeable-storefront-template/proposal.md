# Proposal: Themeable Storefront Template (verticals-as-data engine)

Change: `themeable-storefront-template`
Project: `public-clothes-store-demo`
Status: Proposed
Artifact store: hybrid (this file + engram `sdd/themeable-storefront-template/proposal`)

## Why

Today the storefront exists only as a legacy, single-purpose clothes shop at repo-root `src/` (Vite 5 + React 18 + Tailwind 3). Everything that makes it "a clothes store" is welded into the code: the brand name `"Boutique Exclusiva"` is a string literal in the header, the catalog is a hardcoded TypeScript array (`src/data/products.ts`, ~65 products across 16 categories, complete with duplicate IDs), copy is hardcoded Spanish, prices are rendered with a bare `$` + `toFixed(2)`, theming is a hand-rolled JS object applied through inline `style={{...}}`, and there is no footer at all. Spinning up a second store — a different vertical (mobiles, appliances, whatever) — means forking and rewriting the app.

We want a **storefront template engine** where a "vertical" is pure DATA: its branding (colors, typography, logo, hero, copy), its navigation, its footer, and its catalog (categories + products) live in a config + JSON, and switching or adding a vertical requires **zero code changes** — just a new data folder. The modern `templates/` monorepo (pnpm + turbo, React 19 / React Router 7 / Vite 6 / Tailwind 4) is the right home: Tailwind 4's `@theme` + CSS custom properties make runtime theming cheap and testable, and shared workspace packages let the theme engine be reused independently of any one store.

Success looks like: a new shared theme package that any storefront app can consume; `static-store` re-skinned end-to-end from a single `StoreConfig`; the legacy clothes shop reborn as the `clothes` vertical (data only) with no hardcoded brand/catalog/copy; and a documented, enforced convention where "add a vertical" == "add a folder + config", deployable statically to GitHub Pages.

## What Changes

- **New shared package** `@store-mgmt/theme` (working name) at `templates/packages/theme/` — the theme/catalog engine: `StoreTheme`/`StoreConfig`/`StoreProduct`/`StoreCategory` types, a `ThemeProvider` + `useStoreTheme()` hook, a pure `themeToCssVars()` mapper, the vertical-config loader (build-time selection), and the catalog-provider seam. Exports via subpaths mirroring `web-common` (`./client`, `./server`, types).
- **`templates/apps/static-store` becomes the reference storefront** that consumes the package: the legacy UI (Header, ProductCard, LandingPage/Hero, ProductsPage/catalog) is **ported** onto the new stack and re-implemented against `StoreConfig` (no hardcoded brand/copy/catalog). Routes extended beyond the current single `index` route to include `/productos` (and the client-side product detail).
- **A new `Footer`** designed fresh (legacy has none), fully themeable and config-driven.
- **The `clothes` vertical** authored as the primary deliverable: `verticals/clothes/store.config.ts` + catalog JSON + per-vertical assets under `public/verticals/clothes/**`, reproducing the legacy store as data (minus its bugs).
- **Optionally one extra minimal vertical** (e.g. a tiny `demo`/second example) purely to prove the switch mechanism — not a fully authored second store.
- **Money formatting** via `Intl.NumberFormat` driven by `locale` + `currency` from the config (replacing `$`+`toFixed`).
- **GitHub Pages deploy wiring**: Vite `base` subpath + React Router `basename`, SPA deep-link fallback (`__spa-fallback.html` → `404.html` on deploy), prerender `/` and `/productos`.
- Possible touch-ups to `packages/web-common` primitives (`Card`, `Spinner`, `LoadingOverlay`) so they consume `@theme` tokens instead of raw gray/cyan Tailwind classes, if the port requires it.

## Non-Goals

- **No admin UI / admin functionality of any kind.** We only leave the catalog-provider seam open for a future admin. Building any editing surface is explicitly out of scope.
- **No backend, no database, no auth.** The deploy target is static GitHub Pages.
- **Legacy `src/` is not migrated, refactored, or modified.** It stays as read-only reference; we port FROM it, we do not touch it.
- **No new verticals authored beyond the ported `clothes` vertical** (plus at most ONE minimal example to prove the mechanism). Mobiles/appliances/etc. are not authored now.
- **No reuse of `packages/domain`'s `Product`/`ProductCategory`/`Store`** (SaaS/admin/multi-tenant models with `businessId`, audit fields, `modules`). The theme package defines its own lean storefront types.
- **Not porting legacy bugs**: duplicate/reused product IDs (e.g. id 30/32) and the dead `hero.backgroundImage` field (defined but never rendered) are explicitly excluded.
- No product `variants`/structured attributes engine (size/color stays free-text in `description` as legacy does) — flagged as a future limitation, not built now.

## Approach

**Hybrid: runtime CSS variables for tokens + build-time env var for vertical DATA selection** (exploration Approach C).

1. **Theming (runtime).** Colors, typography and radii are applied as runtime CSS custom properties. A `ThemeProvider` takes a `StoreTheme` and sets `--color-*` / `--font-*` custom properties on the root element; because Tailwind 4 generates utilities as `.text-accent { color: var(--color-accent) }`, overriding those variables at runtime re-skins the app with **zero rebuild**. The core piece is a pure `themeToCssVars(theme): Record<string,string>` mapper — trivially unit-testable in Vitest/jsdom (Strict TDD). Tailwind 4 `@theme` still needs literal default values at build time (the documented "no self-referencing `var()`" gotcha in `web-common/styles.css`), so a default vertical's token values are baked in to avoid a flash of unstyled/default theme before mount; prerender-safety is respected (no unguarded `window`/`localStorage` outside `useEffect`).

2. **Vertical DATA selection (build-time).** Which vertical's *content* loads — catalog, copy, nav, hero, logo, footer — is chosen at build time via `VITE_STORE_VERTICAL` (`import.meta.env`), resolving to `verticals/{name}/store.config.ts`, **statically imported** (not dynamic `import()`) so React Router's prerender inlines it with zero runtime fetch. One deployable artifact per vertical, fully static. A vertical = a data folder; adding one requires no code change.

3. **Catalog behind a single swappable provider seam.** Products/categories are modeled as **JSON** loaded through ONE catalog-provider module — not hardcoded TS arrays. The default provider imports the baked JSON at build time; the seam keeps two future paths open with no UI change: (A) GitOps — edit `products.json` → GitHub Action rebuild+redeploy; (B) runtime fetch from an external writable store (Supabase/Firebase/CMS). Because Pages is read-only, both future paths require either a rebuild or an external store; the seam ensures import-baked-JSON → runtime-fetch is a one-file change later. Catalog schema enforces unique product IDs (test-covered), fixing the legacy duplicate-ID bug.

4. **Assets by convention.** Per-vertical folders `public/verticals/{vertical}/{logo,hero,products/**}` replace legacy's flat `/productos/<category>/<file>` paths, avoiding cross-vertical filename collisions and making "add a vertical" == "add a folder + config". A required-asset check validates the convention.

The two halves stay independently testable: the token layer (`themeToCssVars` + a thin jsdom test that the provider applies vars to the DOM) and the data layer (config loader/validator + catalog provider) evolve separately.

## Package & App Boundaries

- **`templates/packages/theme/` (NEW — `@store-mgmt/theme`)** — the engine. Owns: `StoreTheme`, `StoreConfig`, `StoreProduct`, `StoreCategory` types; `ThemeProvider` + `useStoreTheme()` (client); pure `themeToCssVars()`; the vertical-config resolver (`VITE_STORE_VERTICAL` → `store.config.ts`); the catalog-provider seam interface + default import-baked-JSON provider; money formatter helper over `Intl.NumberFormat`. Exports via subpaths (`./client`, `./server`, types), matching `web-common`. Does NOT depend on `packages/domain` types for storefront models.
- **`templates/apps/static-store/` (PORT TARGET)** — reference storefront that consumes `@store-mgmt/theme`. Mounts `ThemeProvider` in `app/root.tsx`; ports Header, ProductCard, LandingPage/Hero, ProductsPage and adds Footer, all reading from `StoreConfig`/catalog provider; extends `app/routes.ts` for `/productos` + product detail; holds the `verticals/*` data folders and `public/verticals/*` assets; carries the GH Pages deploy config.
- **`templates/packages/web-common/`** — shared primitives. May be touched only to make `Card`/`Spinner`/`LoadingOverlay` consume `@theme` tokens if the port needs it; otherwise unchanged. Continues to own the base `@theme` token defaults and Inter font.
- **`templates/packages/domain/`** — UNTOUCHED. Its `Product`/`Store` are SaaS/admin models and are deliberately not reused (naming-collision and concern-leak risk).
- **repo-root `src/` (LEGACY)** — read-only reference. Not modified.

## StoreConfig / StoreTheme contract (high level)

Detailed field-level requirements belong to the spec; the shape at a glance:

- **`StoreTheme`** — `colors` (primary, primaryHover, secondary, accent, background, surface, text, textMuted [reconciles legacy `textSecondary` + web-common `text-muted`], border, success, danger, warning, info), `typography` (fontFamily, optional heading font, font-size tokens base/sm/lg), `radii`. Aligned to / superset of web-common's existing `@theme` token names.
- **`StoreConfig`** — the full vertical definition:
  - `vertical` id/slug (drives `VITE_STORE_VERTICAL`, exposable as `data-vertical`).
  - `brand`: name, tagline/description, footer copyright.
  - `locale` + `currency` (ISO) → drive `Intl.NumberFormat`.
  - `theme`: a `StoreTheme` (or reference to one).
  - `logo`: asset ref (image preferred) with icon fallback + tint token.
  - `hero`: background image ref, heading, subheading, CTA label/action, overlay color/opacity (pulled from config — fixes legacy's dead hero field).
  - `nav`: ordered `{label, path}` (decide anchor-vs-route link support in spec).
  - `features`/value-props: ordered `{icon (whitelisted lucide name), title, description}`.
  - `footer`: links, contact, social, copyright — designed fresh.
  - `catalog`: `StoreCategory[]` (`{id, name, order?}`) + `StoreProduct[]` (`{id (unique), name, description, price, currency, originalPrice?, categoryId, image(s), isNew?, discount?}`), served through the catalog-provider seam rather than inlined.

## Deployment (GitHub Pages)

Design for static, read-only hosting from day one:

- **Vite `base`** set to the repo subpath and **React Router `basename`** matched to it, so asset and route URLs resolve under `/<repo>/`.
- **SPA deep-link fallback**: rename React Router's generated `__spa-fallback.html` to `404.html` on deploy so deep links / refreshes resolve on Pages.
- **Prerender scope**: `/` (landing) and `/productos` (catalog) are prerendered (`react-router.config.ts`); **product detail stays client-side** over the SPA fallback for now (can be prerendered later from catalog JSON since all IDs are build-time known).
- One deployable artifact per vertical (build-time `VITE_STORE_VERTICAL`). GitOps rebuild path (edit JSON → Action rebuild+redeploy) is the sanctioned future edit path on Pages.

## Risks & Open Questions

- **Naming collision** — `packages/domain` already has `Product` and `Store`. Proposed lean names `StoreProduct` / `StoreCategory` / `StoreConfig` deliberately avoid reuse; the spec/design must confirm final names so "SaaS tenant Store" vs "storefront vertical config" never blur.
- **FOUC / default theme** — Tailwind 4 `@theme` needs literal build-time defaults; we bake a default vertical's tokens to avoid a flash before `ThemeProvider` mounts. Which vertical is the baked default (clothes vs a neutral base) is a design detail to settle.
- **Prerender vs. runtime data** — prerendering `/productos` requires the catalog provider to resolve at build time; the future runtime-fetch provider (path B) would change this. The seam must make that swap a one-file change without breaking prerender for the default import-baked provider.
- **web-common primitives not token-driven** — `Card`/`Spinner`/`LoadingOverlay` still use raw Tailwind palette classes. A clean port may require tokenizing them, which is a `web-common` change (broader blast radius) — flag scope in design.
- **Nav link semantics** — legacy mixes route links (`/productos`) and same-page scroll anchors (`#ofertas`). Decision needed (spec): does the config model both link types, or do we drop scroll-anchors?
- **Product attributes** — size/color live as free text in `description`. Not solving structured `variants` now; noted as a known limitation for verticals where those axes differ (phones: storage/RAM; appliances: capacity).

### Open question needing a decision before spec

- **Package name**: `@store-mgmt/theme` vs `@store-mgmt/theming` vs `@store-mgmt/storefront-theme`. The engine covers BOTH theming AND catalog/config — a name like `theme` slightly undersells the catalog seam. Recommend `@store-mgmt/storefront` or `@store-mgmt/storefront-theme` to signal it owns the whole store-definition contract, not just colors. Please confirm the final package name (and whether the catalog seam should live in the same package or a sibling) before spec.
