# Salesops Storefront Specification

> **STATUS: FROZEN — legacy, 2026-08-06.** The owner has declared this front
> legacy and off-limits: `apps/static-store` and `packages/storefront` are not to
> be modified. This spec is preserved as the record of what was built and how it
> behaves, NOT as a contract for ongoing work.
>
> **Do not edit `packages/storefront` to serve another app.** If `salesops-mvp`
> or any future app needs something this package has, the repo's convention is
> copy-local — see `apps/salesops-mvp/app/data/catalog.ts` ("no cross-app import
> precedent exists in this repo"). Sharing a type with a frozen app means every
> change to the live app has to stay safe for one nobody maintains.
>
> The product catalog contract of record for BACKEND work is the tenant `Product`
> model (`packages/infra-db/prisma/tenant/schema.prisma`) and the
> `ProductResponseDto` CRUD wire shape — NOT the `StoreProduct` type below.
> `backend-products` decided this explicitly: "the storefront `StoreProduct` type
> stays where it is (not merged into the domain entity)". The two are deliberately
> separate; `StoreProduct` is storefront presentation data, and `images`, `isNew`,
> `discount` and `originalPrice` are presentation fields no backend logic reads.

Scope: package `@store-mgmt/storefront` at `templates/packages/storefront` (subpath
exports `./theme`, `./catalog`, `./config`); reference app
`templates/apps/static-store`. Legacy `src/` is read-only reference and MUST NOT be
modified by any requirement below.

## 1. Theme Tokens & ThemeProvider

### Requirement: Required token set
`StoreTheme` MUST define: colors `{primary, primaryHover, secondary, accent, background, surface, text, textMuted, border, success, danger, warning, info}`; typography `{fontFamily, fontSizeBase, fontSizeSm, fontSizeLg}`; radii `{sm, md, lg, pill}`.

#### Scenario: complete theme produces a full CSS var map
- GIVEN a `StoreTheme` with every required token set
- WHEN `themeToCssVars(theme)` is called
- THEN the result has one `--color-*`/`--font-*`/`--radius-*` key per token, all matching input values

### Requirement: Partial theme override with default fallback
The system MUST accept a partial `StoreTheme` override per vertical and MUST fill any token missing from the override with the baked default theme's value.

#### Scenario: vertical overrides only primary color
- GIVEN a vertical theme override of `{colors:{primary:'#112233'}}`
- WHEN merged against the baked default and passed to `themeToCssVars`
- THEN `--color-primary` is `#112233` AND every other token equals the default theme's value

#### Scenario: empty override
- GIVEN an empty override object `{}`
- WHEN merged
- THEN the resulting CSS var map is deep-equal to the default theme's CSS var map

### Requirement: `themeToCssVars` is pure
`themeToCssVars(theme): Record<string,string>` MUST be pure: no DOM/`window`/`localStorage` access, same input yields the same output.

#### Scenario: no side effects
- GIVEN a `StoreTheme` object
- WHEN `themeToCssVars` is called twice with equal input
- THEN both calls return deep-equal records and neither touches `document`/`window`

### Requirement: `ThemeProvider` applies tokens on mount, prerender-safe
`ThemeProvider` MUST set resolved CSS custom properties on the root element on mount and MUST NOT access `window`/`localStorage` outside a client-only effect.

#### Scenario: mount applies CSS vars
- GIVEN `ThemeProvider` wraps children with a given theme
- WHEN rendered and mounted in jsdom
- THEN the root element has each `--color-*`/`--font-*`/`--radius-*` property set to the expected value

#### Scenario: prerender-safe render
- GIVEN `ThemeProvider` renders in a non-browser (prerender) environment
- WHEN the component renders
- THEN no error is thrown and no `window`/`localStorage` API is touched outside a `useEffect` guard

### Requirement: `useStoreTheme()` exposes the active theme
#### Scenario: hook inside provider returns the resolved theme
#### Scenario: hook outside provider throws a descriptive error

## 2. StoreConfig Contract

| Field | Required | Notes |
|---|---|---|
| `vertical` | MUST | slug, drives `VITE_STORE_VERTICAL` |
| `brand.name`, `brand.footerCopyright` | MUST | `brand.tagline` MAY be omitted |
| `theme` | MUST | partial `StoreTheme` override |
| `logo.iconFallback` | MUST if `logo.asset` absent | whitelisted lucide icon name; `logo.asset`/`logo.tint` MAY be omitted |
| `hero.image`, `hero.heading`, `hero.ctaLabel`, `hero.ctaHref` | MUST | `hero.subheading`, `hero.overlay` MAY be omitted |
| `nav` | MUST, >=1 entry | ordered `{label, target:{type:'route'|'anchor', value}}` |
| `features` | MAY | ordered `{icon, title, description}`, icon from whitelist |
| `locale`, `currency` | MUST | BCP47 / ISO 4217 |
| `categories` | MUST | `StoreCategory[]` |
| catalog source ref | MUST | handle into the catalog-provider seam (Section 3) |
| `footer` | MUST | `{links?, contact?, social?, copyright}` |

### Requirement: required fields are validated with a clear error
#### Scenario: valid config loads without error
#### Scenario: missing `brand.name` fails validation naming the field
#### Scenario: `nav` empty array fails validation (MUST have >=1 entry)

### Requirement: nav supports both route and anchor targets
Resolves proposal open question: config models both link kinds via `target.type`.

#### Scenario: route nav entry renders as a router `Link` to `target.value`
#### Scenario: anchor nav entry renders as an in-page anchor to `#target.value`

### Requirement: optional fields degrade gracefully
`hero.overlay`, `brand.tagline`, `features`, `footer.links/contact/social` MAY be omitted; the UI MUST render without them, never as literal "undefined" text.

#### Scenario: config without `features` renders the page without a features section
#### Scenario: config without `hero.overlay` renders the hero with a documented default overlay

## 3. Catalog Provider Seam

### Requirement: catalog provider interface
The `./catalog` export MUST expose an interface with `getCategories()`, `getProducts()`, `getProduct(id)` (sync or `Promise`-returning).

### Requirement: default import-baked-JSON provider, zero runtime fetch
#### Scenario: default provider resolves data via static import, usable during prerender with no network call

### Requirement: swapping the provider requires no UI change
UI consumers (ProductsPage, ProductCard, product detail) MUST depend only on the provider interface.

#### Scenario: a test-double provider implementing the interface is substituted and `ProductsPage` renders correctly with zero code changes to `ProductsPage`

### Requirement: `StoreProduct` / `StoreCategory` shape
`StoreProduct`: `id` (unique string), `name`, `description`, `price` (number), `originalPrice?`, `categoryId` (ref), `image` (URL string, required), `images?` (optional gallery), `isNew?`, `discount?`. `StoreCategory`: `id` (unique), `name`, `order?`.

> **Accepted exception (design decision):** currency is store-level only (`StoreConfig.currency`); `StoreProduct` has NO per-product `currency` field. Per-product currency was judged YAGNI for a single themed storefront and dropped. See §6.

### Requirement: unique product IDs enforced (fixes legacy bug)
#### Scenario: catalog with two products sharing id `"30"` fails validation with a duplicate-ID error
#### Scenario: catalog with all-unique IDs passes validation

### Requirement: every product references an existing category
#### Scenario: `product.categoryId` absent from `categories[]` fails validation

## 4. Vertical Selection

### Requirement: `VITE_STORE_VERTICAL` selects the active config
#### Scenario: `VITE_STORE_VERTICAL=clothes` resolves `verticals/clothes/store.config.ts`; brand/catalog/theme app-wide come from it

### Requirement: missing env var falls back to the documented default vertical
#### Scenario: `VITE_STORE_VERTICAL` unset → build uses the default vertical (`clothes`) with no error

### Requirement: unknown vertical fails the build clearly
#### Scenario: `VITE_STORE_VERTICAL=doesnotexist` → build fails naming the missing `verticals/doesnotexist/store.config.ts` path, no silent fallback

## 5. Storefront UI Parity

### Requirement: Header is entirely config-driven
#### Scenario: two `StoreConfig` fixtures render two different brand names and nav sets from the same `Header` component, with zero hardcoded brand/nav strings in the component

### Requirement: Hero is entirely config-driven (fixes dead `hero.backgroundImage` bug)
#### Scenario: rendered hero image equals `StoreConfig.hero.image`, not a hardcoded literal

### Requirement: ProductCard formats price via `Intl.NumberFormat` and uses theme-token badges
#### Scenario: `isNew=true` renders a "new" badge styled via a theme color token, not a hardcoded Tailwind class
#### Scenario: `discount=20` renders a "-20%" badge styled via a theme color token
#### Scenario: price renders via `Intl.NumberFormat`, not `"$" + toFixed(2)` concatenation

### Requirement: catalog page supports category filtering
#### Scenario: selecting a category shows only products with that `categoryId`
#### Scenario: selecting "all" shows products across all categories

### Requirement: product detail resolves client-side
#### Scenario: navigating to a product detail route in the browser renders that product's data, resolved client-side against the catalog provider (not prerendered)

### Requirement: Footer is entirely config-driven (new component, no legacy equivalent)
#### Scenario: two `StoreConfig` fixtures render two different footer copyright/link sets from the same `Footer` component, with zero hardcoded vertical copy

## 6. Money Formatting

### Requirement: shared money-format helper uses `Intl.NumberFormat`
Formats `price`/`originalPrice` via `Intl.NumberFormat(locale, {style:'currency', currency})`, using the store-level `StoreConfig.currency` and `StoreConfig.locale` (no per-product currency override — see accepted exception in §2).

#### Scenario: locale `es-NI` + currency `NIO` formats per `es-NI`/`NIO` conventions
#### Scenario: locale `en-US` + currency `USD` formats per `en-US`/`USD` conventions

## 7. GitHub Pages Deploy

### Requirement: static build resolves under a base subpath
#### Scenario: `vite build` with configured `base` emits asset URLs prefixed with the base subpath (e.g. `/repo-name/assets/...`)

### Requirement: SPA deep-link fallback via `404.html`
#### Scenario: build output includes `404.html` (renamed SPA fallback) enabling a direct/refreshed navigation to `/repo-name/productos` to resolve client-side

### Requirement: `/` and `/productos` are prerendered; product detail is not
#### Scenario: build output contains static HTML for `/` and `/productos`
#### Scenario: build output contains no prerendered HTML for a product-detail route (confirms client-side-only by design)

### Requirement: React Router `basename` matches Vite `base`
#### Scenario: an in-app `Link` navigation produces an href prefixed with the configured basename

## 8. Clothes Vertical

### Requirement: `verticals/clothes/store.config.ts` reproduces legacy visible content
#### Scenario: `brand.name === "Boutique Exclusiva"`
#### Scenario: `categories` has the same 16 entries (names/ids) as the legacy store

### Requirement: clothes catalog ports legacy products without legacy bugs
#### Scenario: all product IDs are unique (no id `30`/`32` duplication as in legacy)
#### Scenario: `hero.image` is a real, resolvable asset consumed by `Hero` (fixes legacy's dead `hero.backgroundImage` field)

## Non-Goals

- No admin UI or editing surface — catalog-provider seam only.
- No backend, database, or auth — static GitHub Pages hosting only.
- Legacy `src/` is not modified by any requirement in this spec.
- No verticals beyond `clothes` are authored here, except optionally one minimal example solely to prove `VITE_STORE_VERTICAL` switching (no full content parity required for it).
- No structured product variants/attributes engine — size/color stay free text in `description`.
- `packages/domain`'s `Product`/`ProductCategory`/`Store` types are not reused.
