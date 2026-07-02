# Tasks: Themeable Storefront Template

**Status: IMPLEMENTATION COMPLETE** — all 6 slices (Phases 1-11) done, all tasks `[x]`. Ready for `sdd-verify`.

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

## Phase 7: Routes + Prerender Config (spec Sections 5, 7) — DONE (Slice 4)

- [x] 7.1 Edit `templates/apps/static-store/app/routes.ts` — add `route('productos', ...)`, `route('productos/:id', ...)` per design 6.1
- [x] 7.2 RED: `app/routes/__tests__/products.test.tsx` — targets an exported `ProductsPage({config, catalog})` presentational component (same prop-injectable pattern as Slice 3's Header/Hero/etc — see Deviations) rather than the live `activeConfig`/`catalog` singletons, so the test stays deterministic and independent of the Phase 8 data swap; asserts default-shows-all, category-filter narrows, "All" resets
- [x] 7.3 GREEN: `app/routes/products.tsx` — exports `ProductsPage` (filter state owned here, NOT in `ProductGrid`) + a thin default `ProductsRoute` wrapping it with live `activeConfig`/`catalog`
- [x] 7.4 RED: `app/routes/__tests__/product-detail.test.tsx` — targets exported `ProductDetailPage({config, catalog})`; client-side resolution against catalog provider by `:id` param (via `MemoryRouter`/`Routes`), found + graceful-not-found cases
- [x] 7.5 GREEN: `app/routes/product-detail.tsx` — exports `ProductDetailPage` + thin default `ProductDetailRoute`
- [x] 7.6 Edit `templates/apps/static-store/app/routes/home.tsx` — replaced placeholder; exports `HomePage({config, catalog})` (Hero + optional `config.features` section + discounted/new-arrivals `ProductGrid` strips) + thin default `Home` wrapper; `app/root.tsx`'s `App()` now also mounts `Header`/`Footer` around `<Outlet/>` once for every route (RED/GREEN in `app/__tests__/root.test.tsx`, new `describe('root App', ...)` block)
- [x] 7.7 Edit `templates/apps/static-store/react-router.config.ts` — `prerender: ['/', '/productos']`, `ssr: false` (product-detail intentionally excluded, resolves client-side)
- [x] 7.8 Build/output assertion (manual, matching Slices 2-3 precedent — no automated build-shelling-out test added to the unit suite): `pnpm --filter @store-mgmt/static-store build` → `Prerender (html): / -> build/client/index.html` AND `Prerender (html): /productos -> build/client/productos/index.html`; no prerendered HTML for product-detail; verified via evidence in apply-progress

## Phase 8: Clothes Vertical Data (spec Section 8) — DONE (Slice 4)

- [x] 8.1 Create `templates/apps/static-store/verticals/clothes/store.config.ts` — `brand.name === "Boutique Exclusiva"`; **17** categories ported from legacy `src/data/products.ts` (spec said "16"; legacy actually has 17 — data fidelity to the real legacy source wins over the spec's headcount, see Deviations)
- [x] 8.2 Create `templates/apps/static-store/verticals/clothes/catalog.json` — 62 products generated from the REAL files under `public/productos/**` (legacy's `products.ts` also declares 62 entries, confirming the count; some legacy `image` string literals didn't match actual on-disk filenames — e.g. `menguatada*.jpg` vs real `enguatada*.jpg`, `pulover*.jpg` vs real `istockphoto-*.jpg` — real filenames used, mapped positionally per category; see Deviations), **unique IDs enforced** (fresh sequential string ids `"1".."62"`, fixes legacy dup ids 30/32), every `categoryId` resolves
- [x] 8.3 Copy assets to `templates/apps/static-store/public/verticals/clothes/{hero.jpg, products/**}` from `public/productos/**` (62 files) and `public/hero5.jpg` (legacy has no `src/images/**` product tree — real legacy product assets live under repo-root `public/productos/**`, not `src/images`; hero source is `public/hero5.jpg`, matching `LandingPage.tsx`'s `<img src="hero5.jpg">`)
- [x] 8.4 RED/data-assertion: `verticals/__tests__/clothes-config.test.ts` (added to `vitest.config.ts`'s `include` glob, which previously only covered `app/**`) — `validateStoreConfig(clothesConfig)` passes; no duplicate product ids; every `categoryId` resolves; hero + all 62 product image assets resolve to real files under `public/verticals/clothes/` (`existsSync` check); brand name + catalog counts (62 products / 17 categories)
- [x] 8.5 GREEN: real data satisfies 8.4 on first run (data was generated from the actual file listing, so no gaps needed fixing)
- [x] 8.6 Register `clothes` in `app/store/verticals.ts` `VERTICALS` map — unchanged, already registered in Slice 2 (still points at the same `clothesConfig` export, now backed by real data)

## Phase 9: Demo Vertical + Switchability (late decision — in scope)

- [x] 9.1 Create `templates/apps/static-store/verticals/demo/store.config.ts` — distinct brand name/theme colors, 1-2 categories, 2-3 products
- [x] 9.2 Create `templates/apps/static-store/verticals/demo/catalog.json` + `public/verticals/demo/{logo,hero,products/**}` minimal assets
- [x] 9.3 RED: `verticals/__tests__/demo-config.test.ts` — `validateStoreConfig(demoConfig)` passes, required-asset check
- [x] 9.4 GREEN: fix data gaps
- [x] 9.5 Register `demo` in `app/store/verticals.ts` `VERTICALS` map
- [x] 9.6 RED: `app/__tests__/switchability.test.ts` — `resolveVertical(VERTICALS, 'demo')` returns demo config with different `brand.name`/`theme.colors.primary`/product set than `resolveVertical(VERTICALS, 'clothes')` (asserts re-skin, not just data presence)
- [x] 9.7 GREEN: confirm passes with no engine changes (registry-only diff, proves "add a vertical" == "add a folder + line")
- [x] 9.8 Build/output assertion (documented, optional CI): `VITE_STORE_VERTICAL=demo` build succeeds and emits `data-vertical="demo"` in prerendered `index.html`

## Phase 10: GitHub Pages Deploy Wiring (spec Section 7 + late decision on VITE_BASE) — DONE (Slice 6)

- [x] 10.1 Edit `templates/apps/static-store/vite.config.ts` — `base: process.env.VITE_BASE || '/'`
- [x] 10.2 Edit `templates/apps/static-store/react-router.config.ts` — `basename: process.env.VITE_BASE || '/'` (matches Vite `base`)
- [x] 10.3 RED: `templates/packages/storefront/src/__tests__/asset.test.ts` — new `describe('default base falls back to import.meta.env.BASE_URL', ...)` block (`vi.stubEnv('BASE_URL', '/repo/')`) proving `withBase`/`verticalAsset` fall back to `import.meta.env.BASE_URL` (which Vite populates from `base`, itself threaded from `VITE_BASE`) when no explicit `base` argument is given — confirmed RED against the pre-change hardcoded `base = '/'` default (2 failing assertions, see apply-progress). Build/output-level proof (asset/script/link URLs prefixed under a subpath build) covers the vite.config/react-router.config wiring itself, per this slice's build-vs-unit-test split.
- [x] 10.4 GREEN: `templates/packages/storefront/src/config/asset.ts` — changed `withBase`/`verticalAsset` default `base` param to `import.meta.env.BASE_URL`; added `templates/packages/storefront/src/vite-env.d.ts` (local ambient `ImportMetaEnv`/`ImportMeta` typing, no `vite` package dependency needed). Added `templates/apps/static-store/scripts/prepare-pages-build.mjs` — **not** a plain `cp` as originally sketched: React Router physically nests prerendered HTML under `build/client/<basename>/` when `basename` is a subpath (assets/static files stay at the build root), which does NOT match how GitHub Pages project pages serve a repo (branch root → `/<repo>/`); the script flattens that nested HTML back up to the build root (discovered + fixed this slice, see apply-progress Deviations), *and* renames `build/client/__spa-fallback.html` → `build/client/404.html`.
- [x] 10.5 `templates/apps/static-store/package.json` — added `build:pages` (`VITE_BASE=$VITE_BASE react-router build && node scripts/prepare-pages-build.mjs`) and `deploy` (same + `gh-pages -d build/client`) scripts; added `gh-pages@^6.3.0` devDependency (matches the version already used by the legacy root `package.json`). Default `build` script unchanged (`base: '/'`).
- [x] 10.6 Documented in `templates/apps/static-store/README.md` (new) — full `VITE_BASE` env-configurability section (`Deploying to GitHub Pages`), how Vite `base` = RR `basename` = `VITE_BASE` are threaded, the flatten/404 rationale, and out-of-scope note on GH Pages being read-only. `templates/packages/storefront/README.md` (new) documents the package's own subpath exports and the `import.meta.env.BASE_URL` default-fallback for `withBase`/`verticalAsset`, and points to the static-store README for the full vertical/theming/deploy guide.

## Phase 11: Full Verification Pass — DONE (Slice 6)

- [x] 11.1 `corepack pnpm run test` (turbo, from `templates/`) — 4/4 tasks successful: `@store-mgmt/domain` 66/66, `@store-mgmt/web-common` 11/11, `@store-mgmt/storefront` 43/43 (was 40; +3 new asset.test.ts default-base cases), `@store-mgmt/static-store` 57/57. All green.
- [x] 11.2 `corepack pnpm run typecheck` (turbo) — 7/7 tasks successful, includes both `@store-mgmt/storefront` (`tsc --noEmit`) and `@store-mgmt/static-store` (`react-router typegen && tsc`). Zero errors.
- [x] 11.3 `VITE_STORE_VERTICAL=clothes corepack pnpm --filter @store-mgmt/static-store build` — `Prerender (html): / -> build/client/index.html`, `/productos -> build/client/productos/index.html`, no product-detail prerender. Confirmed `data-vertical="clothes"`/`"Boutique Exclusiva"` present.
- [x] 11.4 `VITE_STORE_VERTICAL=demo corepack pnpm --filter @store-mgmt/static-store build` — same prerender shape, `data-vertical="demo"`/`"Demo Store"`/`--color-primary: rgb(37 99 235)` present (distinct from clothes' `rgb(239 68 68)`) — switchability re-confirmed after the base/basename change. Default (clothes) build re-run afterward to restore local `build/client/` state (gitignored, no git-visible effect).
- [x] 11.5 `git diff --stat -- src/` empty — legacy untouched, confirmed via no output.

### Slice 6 additional verification (Phase 10 GH Pages proof, beyond the original checklist)

- Subpath build: `VITE_BASE=/public-clothes-store-demo/ corepack pnpm --filter @store-mgmt/static-store run build:pages` (from `templates/`, one command) — `build/client/index.html` (flattened, not nested), `build/client/productos/index.html`, `build/client/404.html` all present; every `src="…"`/`href="…"` in `index.html` (scripts, CSS, images, internal `<Link>` hrefs) prefixed with `/public-clothes-store-demo/`. Default (`base: '/'`) build re-verified unprefixed and unaffected immediately after.
