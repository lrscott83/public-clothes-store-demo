# Tasks: Themeable Storefront Template

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2800-3600 (new package + ported app + 2 verticals + deploy) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 package engine -> PR2 ThemeProvider+wiring -> PR3 UI components -> PR4 routes+clothes vertical -> PR5 demo vertical+switch test -> PR6 GH Pages deploy+docs |
| Delivery strategy | ask-on-risk (default; orchestrator must confirm) |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Package scaffold + pure engine (theme/config/catalog units) | PR 1 | ~500-600 lines incl. tests; independent, no app changes |
| 2 | ThemeProvider + static-store wiring (root.tsx, vertical registry) | PR 2 | depends on PR1; ~250-350 lines |
| 3 | Ported UI components (Header/Hero/ProductCard/Grid/Detail/Footer) | PR 3 | depends on PR2; ~700-900 lines (RTL tests heavy) |
| 4 | Routes + clothes vertical data (config+catalog+assets) | PR 4 | depends on PR3; ~500-700 lines incl. JSON |
| 5 | Demo vertical + switchability test | PR 5 | depends on PR4; ~200-300 lines |
| 6 | GH Pages deploy wiring (VITE_BASE, 404.html, scripts, docs) + final verification | PR 6 | depends on PR5; ~150-250 lines |

## Phase 1: Package Scaffold (`@store-mgmt/storefront`)

- [x] 1.1 Create `templates/packages/storefront/package.json` (name, exports `./theme` `./catalog` `./config`, scripts, deps mirroring `templates/packages/web-common/package.json`)
- [x] 1.2 Create `templates/packages/storefront/tsconfig.json` (copy `web-common/tsconfig.json`)
- [x] 1.3 Create `templates/packages/storefront/vitest.config.ts` + `vitest.setup.ts` (jsdom, copy web-common)
- [x] 1.4 Add `templates/packages/storefront` to root `pnpm-workspace.yaml`/turbo pipeline if not auto-included; verify `pnpm install` links it

## Phase 2: Pure Engine Units — Types (no tests, foundation)

- [x] 2.1 `src/theme/types.ts` — `StoreTheme`, `StoreThemeColors`, `StoreThemeTypography`, `StoreThemeRadii` (+ `PartialStoreTheme` for per-vertical overrides)
- [x] 2.2 `src/catalog/types.ts` — `StoreProduct`, `StoreCategory`, `CatalogData`, `CatalogProvider`
- [x] 2.3 `src/config/types.ts` — `StoreConfig`, `StoreVertical`, `Brand`, `LogoConfig`, `HeroConfig`, `NavItem`, `FeatureItem`, `FooterConfig`, `FooterLink`

## Phase 3: Pure Engine Units — TDD (spec Sections 1, 3, 4, 6)

- [x] 3.1 RED: `src/__tests__/theme-to-css-vars.test.ts` — full token map, purity (no `window`/`document`), deep-equal on repeat calls (spec 1: complete/no-side-effects scenarios)
- [x] 3.2 GREEN: implement `src/theme/theme-to-css-vars.ts` per design 3.1
- [x] 3.3 RED: `src/__tests__/money.test.ts` — `es-NI`/NIO, `en-US`/USD, memoization same-instance, currency override (spec 6)
- [x] 3.4 GREEN: implement `src/config/money.ts` (`formatMoney`, memoized `Intl.NumberFormat`)
- [x] 3.5 RED: `src/__tests__/asset.test.ts` — `withBase`/`verticalAsset` leading-slash normalization, base-path joining (design 5.2)
- [x] 3.6 GREEN: implement `src/config/asset.ts`
- [x] 3.7 RED: `src/__tests__/baked-provider.test.ts` — `getProductById` hit/miss, `getProductsByCategory` filter, categories passthrough, empty catalog (spec 3)
- [x] 3.8 GREEN: implement `src/catalog/baked-provider.ts` (`createBakedCatalogProvider`)
- [x] 3.9 RED: `src/__tests__/resolve-vertical.test.ts` — requested hit, missing->fallback, missing fallback throws, empty/whitespace env->default (spec 4)
- [x] 3.10 GREEN: implement `src/config/resolve-vertical.ts` (`resolveVertical`, `DEFAULT_VERTICAL='clothes'`)
- [x] 3.11 RED: `src/__tests__/validate-store-config.test.ts` — required-field presence per field table (spec 2), duplicate product ID rejected (spec 3, legacy-bug regression), `categoryId` referential integrity (spec 3), empty `nav` fails (spec 2), `originalPrice > price` regression
- [x] 3.12 GREEN: implement `src/config/validate.ts` (`validateStoreConfig`, actionable error messages)
- [x] 3.13 Wire barrels: `src/theme/index.ts`, `src/catalog/index.ts`, `src/config/index.ts` per design Section 1 export table
- [x] 3.14 (added, not in original breakdown) `src/theme/default-theme.ts` (`DEFAULT_STORE_THEME`) + `src/theme/merge-theme.ts` (`mergeTheme`) with `src/__tests__/merge-theme.test.ts` — implements spec 1's "partial theme override with default fallback" requirement, which needed a merge step ahead of `themeToCssVars`

## Phase 4: ThemeProvider (spec Section 1, design Section 3) — DONE (Slice 2)

- [x] 4.1 RED: `src/__tests__/theme-provider.test.tsx` — mount applies inline `<style>` with expected `--color-*`/`--font-*`/`--radius-*` vars (jsdom); prerender-safe render (no `window`/`localStorage` access outside guard); `useStoreTheme` inside provider returns theme; `useStoreTheme` outside provider throws descriptive error
- [x] 4.2 GREEN: implement `src/theme/theme-provider.tsx` (`ThemeProvider`, `useStoreTheme`) per design 3.2
- [x] 4.3 Confirm barrel export includes `ThemeProvider`/`useStoreTheme`/`StoreTheme`

## Phase 5: static-store Wiring — DONE (Slice 2)

- [x] 5.1 Add `"@store-mgmt/storefront": "workspace:*"` to `templates/apps/static-store/package.json`; add to `vite.config.ts` `optimizeDeps.include`
- [x] 5.2 Create `templates/apps/static-store/app/store/verticals.ts` — static import registry `VERTICALS` (design 5.1)
- [x] 5.3 Create `templates/apps/static-store/app/store/active.ts` — `activeConfig` via `resolveVertical`+`validateStoreConfig`, `catalog` via `createBakedCatalogProvider`
- [x] 5.4 RED: `templates/apps/static-store/app/__tests__/root.test.tsx` (moved from the originally-suggested `app/routes/__tests__/` since `root.tsx` lives at `app/`, not `app/routes/`) — shallow-inspects the `Layout` React element tree for `data-vertical`/`lang` and a `ThemeProvider` wrapping the body children (see Deviations: jsdom refuses to insert a nested `<html>` as a child during `render()`, so a DOM-level RTL assertion was unreliable; verified for real via the prerendered build output instead — see apply-progress)
- [x] 5.5 GREEN: edit `templates/apps/static-store/app/root.tsx` — mount `ThemeProvider` in `Layout`, set `data-vertical`/`lang` from `activeConfig`
- [x] 5.6 Add app-level base rule applying `var(--font-family)` (design 3.3) — new `app/app.css` (`@layer base { html { font-family: var(--font-family, ...) } }`), imported in `root.tsx` after `@store-mgmt/web-common/styles.css`; `web-common` itself untouched
- [x] 5.7 (added) `templates/apps/static-store/verticals/clothes/store.config.ts` — MINIMAL placeholder clothes `StoreConfig` (brand + theme override + 1 category/1 product) so the app builds/prerenders now; Slice 4 (Phase 8) replaces it with the full legacy-parity catalog + real assets

## Phase 6: Ported UI Components (spec Section 5) — RTL, config-driven — DONE (Slice 3)

- [x] 6.1 RED: `app/components/__tests__/header.test.tsx` — two `StoreConfig` fixtures render different brand/nav (route vs anchor semantics), zero hardcoded strings
- [x] 6.2 GREEN: `app/components/header.tsx` (ported from `src/components/Header.tsx`, re-implemented against `StoreConfig`)
- [x] 6.3 RED: `app/components/__tests__/hero.test.tsx` — rendered image equals `config.hero.image` (regression for legacy dead `hero.backgroundImage` bug), heading/subheading/CTA from config, default overlay when `hero.overlay` omitted
- [x] 6.4 GREEN: `app/components/hero.tsx` (ported from `src/pages/LandingPage.tsx` hero section)
- [x] 6.5 RED: `app/components/__tests__/product-card.test.tsx` — `isNew` badge via theme token, `discount=20` badge, price via `formatMoney` (not `$`+`toFixed`)
- [x] 6.6 GREEN: `app/components/product-card.tsx` (ported from `src/components/ProductCard.tsx`)
- [x] 6.7 RED: `app/components/__tests__/product-grid.test.tsx` — renders only the given products (a category-filtered subset vs the full set — actual category-filter UI lives in the Slice 4 route/page, this component is purely presentational per the apply scope), "all" shows across categories
- [x] 6.8 GREEN: `app/components/product-grid.tsx` (ported from `src/pages/ProductsPage.tsx` grid logic; filtering itself deferred to the Slice 4 route)
- [x] 6.9 RED: `app/components/__tests__/footer.test.tsx` — two fixtures render different copyright/link sets, zero hardcoded copy (spec 5, new component)
- [x] 6.10 GREEN: `app/components/footer.tsx` (new, no legacy equivalent)

## Phase 7: Routes + Prerender Config (spec Sections 5, 7)

- [ ] 7.1 Edit `templates/apps/static-store/app/routes.ts` — add `route('productos', ...)`, `route('productos/:id', ...)` per design 6.1
- [ ] 7.2 RED: `app/routes/__tests__/products.test.tsx` — `/productos` renders grid+filters from `activeConfig`+`catalog`
- [ ] 7.3 GREEN: `app/routes/products.tsx`
- [ ] 7.4 RED: `app/routes/__tests__/product-detail.test.tsx` — client-side resolution against catalog provider by `:id` param
- [ ] 7.5 GREEN: `app/routes/product-detail.tsx`
- [ ] 7.6 Edit `templates/apps/static-store/app/routes/home.tsx` — wire Hero/features/footer from `activeConfig` (replace placeholder home)
- [ ] 7.7 Edit `templates/apps/static-store/react-router.config.ts` — `prerender: ['/', '/productos']`, `ssr: false`
- [ ] 7.8 Build/output assertion test: prerendered `index.html` and `productos/index.html` exist after build; no prerendered HTML for product-detail route

## Phase 8: Clothes Vertical Data (spec Section 8)

- [ ] 8.1 Create `templates/apps/static-store/verticals/clothes/store.config.ts` — `brand.name === "Boutique Exclusiva"`, same 16 categories as legacy `src/data/products.ts`
- [ ] 8.2 Create `templates/apps/static-store/verticals/clothes/catalog.json` — port legacy products, **unique IDs enforced** (no dup 30/32), every `categoryId` resolves
- [ ] 8.3 Copy/convert assets to `templates/apps/static-store/public/verticals/clothes/{logo,hero,products/**}` from `src/images/**`
- [ ] 8.4 RED: `verticals/__tests__/clothes-config.test.ts` — `validateStoreConfig(clothesConfig)` passes; required-asset check (every referenced asset key resolves to a file under `public/verticals/clothes/`)
- [ ] 8.5 GREEN: fix any data gaps until 8.4 passes
- [ ] 8.6 Register `clothes` in `app/store/verticals.ts` `VERTICALS` map

## Phase 9: Demo Vertical + Switchability (late decision — in scope)

- [ ] 9.1 Create `templates/apps/static-store/verticals/demo/store.config.ts` — distinct brand name/theme colors, 1-2 categories, 2-3 products
- [ ] 9.2 Create `templates/apps/static-store/verticals/demo/catalog.json` + `public/verticals/demo/{logo,hero,products/**}` minimal assets
- [ ] 9.3 RED: `verticals/__tests__/demo-config.test.ts` — `validateStoreConfig(demoConfig)` passes, required-asset check
- [ ] 9.4 GREEN: fix data gaps
- [ ] 9.5 Register `demo` in `app/store/verticals.ts` `VERTICALS` map
- [ ] 9.6 RED: `app/__tests__/switchability.test.ts` — `resolveVertical(VERTICALS, 'demo')` returns demo config with different `brand.name`/`theme.colors.primary`/product set than `resolveVertical(VERTICALS, 'clothes')` (asserts re-skin, not just data presence)
- [ ] 9.7 GREEN: confirm passes with no engine changes (registry-only diff, proves "add a vertical" == "add a folder + line")
- [ ] 9.8 Build/output assertion (documented, optional CI): `VITE_STORE_VERTICAL=demo` build succeeds and emits `data-vertical="demo"` in prerendered `index.html`

## Phase 10: GitHub Pages Deploy Wiring (spec Section 7 + late decision on VITE_BASE)

- [ ] 10.1 Edit `templates/apps/static-store/vite.config.ts` — `base: process.env.VITE_BASE ?? '/'`
- [ ] 10.2 Edit `templates/apps/static-store/react-router.config.ts` — `basename: process.env.VITE_BASE ?? '/'` (MUST match Vite `base`)
- [ ] 10.3 RED: build/output assertion test — asset URLs in built `index.html` are prefixed with `VITE_BASE` subpath when set; `basename` produces prefixed `<Link>` hrefs (spec 7: base-subpath + basename-match scenarios)
- [ ] 10.4 GREEN: verify 10.1/10.2 satisfy 10.3; add a `deploy` script step (e.g. `scripts/rename-spa-fallback.mjs` or inline `cp`) that renames `build/client/__spa-fallback.html` -> `404.html` at publish root
- [ ] 10.5 Add/update `package.json` `deploy` script wiring `gh-pages` package to publish `build/client/` after the 404.html rename step
- [ ] 10.6 Document `VITE_BASE` env-configurability (default `/`) in `templates/apps/static-store/README.md` (or root docs) — how to set for GH Pages repo subpath, how Vite `base` = RR `basename` = `VITE_BASE` are threaded together

## Phase 11: Full Verification Pass

- [ ] 11.1 Run `vitest run` (or `pnpm test` via turbo) at `templates/` — all unit + RTL tests green
- [ ] 11.2 Run `pnpm --filter @store-mgmt/storefront typecheck` and `pnpm --filter @store-mgmt/static-store typecheck`
- [ ] 11.3 Run `VITE_STORE_VERTICAL=clothes pnpm --filter @store-mgmt/static-store build` — confirm prerendered `/` + `/productos`, no product-detail prerender
- [ ] 11.4 Run `VITE_STORE_VERTICAL=demo pnpm --filter @store-mgmt/static-store build` — confirm distinct branding in output (switchability proof at build level)
- [ ] 11.5 Confirm legacy `src/` untouched (`git diff --stat src/` empty)
