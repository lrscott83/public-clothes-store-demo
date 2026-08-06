# Design: Themeable Storefront Template (verticals-as-data engine)

Change: `themeable-storefront-template`
Project: `public-clothes-store-demo`
Status: Designed
Artifact store: hybrid (this file + engram `sdd/themeable-storefront-template/design`)

This is the HOW at architectural level. It designs AROUND the locked decisions from the
proposal; it does not re-open them. Task breakdown (WHAT-to-do steps) belongs to `sdd-tasks`.

---

## 0. Locked decisions honored

- ONE package `@store-mgmt/storefront` at `templates/packages/storefront`, subpath exports
  `./theme`, `./catalog`, `./config` (mirrors `web-common`'s `exports` map + `tsc` build).
- `static-store` consumes it; legacy `src/` untouched.
- Hybrid theming: runtime CSS custom properties via `ThemeProvider` + build-time vertical via
  `VITE_STORE_VERTICAL` → statically imported `verticals/{name}/store.config.ts`.
- `@theme` uses LITERAL default values (no self-referencing `var()` — dropping-utility gotcha).
- Catalog behind ONE swappable provider seam; default = import-baked JSON. Admin = seam only.
- GitHub Pages static deploy: Vite `base`, RR `basename`, SPA fallback → `404.html`,
  prerender `/` + `/productos`, product detail client-side.
- Money via `Intl.NumberFormat`. Fresh Footer. Lean `StoreProduct`/`StoreCategory`. No legacy bugs.

---

## 1. Package layout — `templates/packages/storefront`

Mirrors `web-common`: `type: module`, `tsc` build to `dist/`, `exports` subpath map, no bundler.
The package is **framework-agnostic at the data layer** (`./config`, `./catalog` are plain TS +
types, no React) and **React at the theme layer** (`./theme`). Vertical DATA and per-app assets do
NOT live in the package — they live in the consuming app (`static-store`), because
`VITE_STORE_VERTICAL` and `public/` are app-scoped. The package owns the CONTRACTS and the ENGINE.

```
templates/packages/storefront/
├── package.json                # name @store-mgmt/storefront, exports ./theme ./catalog ./config
├── tsconfig.json               # copy of web-common tsconfig (ES2022, declaration, outDir dist)
├── vitest.config.ts            # jsdom, globals, setupFiles (copy web-common)
├── vitest.setup.ts             # import '@testing-library/jest-dom'
├── src/
│   ├── config/
│   │   ├── index.ts            # barrel: types + resolveVertical + validateStoreConfig + formatMoney + withBase
│   │   ├── types.ts            # StoreConfig, StoreVertical, Brand, Hero, NavItem, FeatureItem, FooterConfig, LogoConfig
│   │   ├── resolve-vertical.ts # VITE_STORE_VERTICAL → StoreConfig (STATIC import registry, no dynamic import())
│   │   ├── validate.ts         # validateStoreConfig(config): asserts required fields, unique product ids
│   │   ├── money.ts            # formatMoney(amount, {locale, currency}) via Intl.NumberFormat (memoized)
│   │   └── asset.ts            # withBase(path): base-path-aware asset URL helper
│   ├── catalog/
│   │   ├── index.ts            # barrel: StoreProduct, StoreCategory, CatalogProvider, createBakedCatalogProvider
│   │   ├── types.ts            # StoreProduct, StoreCategory, CatalogProvider, CatalogData
│   │   └── baked-provider.ts   # createBakedCatalogProvider(data): synchronous, prerender-safe default
│   └── theme/
│       ├── index.ts            # barrel: StoreTheme, ThemeProvider, useStoreTheme, themeToCssVars
│       ├── types.ts            # StoreTheme (colors, typography, radii)
│       ├── theme-to-css-vars.ts# pure themeToCssVars(theme): Record<string,string>
│       └── theme-provider.tsx  # <ThemeProvider theme> + useStoreTheme() hook (client + prerender-safe)
└── src/__tests__/              # co-located Strict-TDD unit tests
```

### package.json (shape)

```jsonc
{
  "name": "@store-mgmt/storefront",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./theme": "./src/theme/index.ts",
    "./catalog": "./src/catalog/index.ts",
    "./config": "./src/config/index.ts",
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint \"src/**/*.ts\" --fix",
    "clean": "rimraf dist build .react-router",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    /* identical devDeps to web-common: eslint-config, @tailwindcss/vite, testing-library,
       @types/*, jsdom, tailwindcss, vite, vite-tsconfig-paths, vitest, rimraf */
  }
}
```

- **No dependency on `@store-mgmt/domain`** (locked: lean types, no SaaS models).
- `react`/`react-dom` are needed only by `./theme`; `./config` and `./catalog` import nothing
  React so they stay usable in Node prerender / plain scripts.
- Consumer (`static-store`) adds `"@store-mgmt/storefront": "workspace:*"` and MUST add it to
  `vite.config.ts` `resolve.dedupe` is already global for react; also add to
  `optimizeDeps.include` alongside `@store-mgmt/domain` to avoid the second-React-copy gotcha.

### What each subpath exports

| Subpath | Exports | React? |
|---|---|---|
| `./config` | `StoreConfig`, `StoreVertical`, `Brand`, `Hero`, `NavItem`, `FeatureItem`, `FooterConfig`, `LogoConfig`; `resolveVertical()`, `validateStoreConfig()`, `formatMoney()`, `withBase()` | No |
| `./catalog` | `StoreProduct`, `StoreCategory`, `CatalogData`, `CatalogProvider`; `createBakedCatalogProvider()` | No |
| `./theme` | `StoreTheme`; `ThemeProvider`, `useStoreTheme()`, `themeToCssVars()` | Yes |

---

## 2. TypeScript contracts (real code)

### 2.1 `./theme` — StoreTheme

Token names are the **canonical superset of web-common's `@theme`** so `themeToCssVars` output
maps 1:1 onto existing utilities. Legacy `textSecondary` is reconciled to `textMuted`
(→ `--color-text-muted`). Camel-case keys in TS; the mapper converts to kebab CSS var names.

```ts
// src/theme/types.ts
export interface StoreThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textMuted: string;   // reconciles legacy `textSecondary` + web-common `text-muted`
  border: string;
  success: string;
  danger: string;
  warning: string;
  info: string;
}

export interface StoreThemeTypography {
  fontFamily: string;            // e.g. "'Inter', system-ui, sans-serif"
  headingFontFamily?: string;    // optional distinct heading font; falls back to fontFamily
  fontSizeBase: string;          // "0.875rem"
  fontSizeSm: string;
  fontSizeLg: string;
}

export interface StoreThemeRadii {
  sm: string;   // "2px"
  md: string;
  lg: string;
  pill: string; // "9999px"
}

export interface StoreTheme {
  colors: StoreThemeColors;
  typography: StoreThemeTypography;
  radii: StoreThemeRadii;
}
```

### 2.2 `./catalog` — StoreProduct, StoreCategory, CatalogProvider

```ts
// src/catalog/types.ts
export interface StoreCategory {
  id: string;
  name: string;
  order?: number;
}

export interface StoreProduct {
  id: string;              // UNIQUE across the catalog (validator enforces — fixes legacy dup-id bug)
  name: string;
  description: string;
  price: number;
  categoryId: string;      // references StoreCategory.id
  image: string;           // vertical-relative asset key, resolved via withBase()
  images?: string[];       // optional gallery for product detail
  originalPrice?: number;  // strike-through source; when present should be > price
  isNew?: boolean;
  discount?: number;       // percent 0..100; badge source
}

export interface CatalogData {
  categories: StoreCategory[];
  products: StoreProduct[];
}

// The seam. Sync-first so the default baked provider is prerender-safe (no async in Node build).
// A future runtime-fetch / GitOps provider implements the same shape but MAY return Promises;
// consumers that need swap-safety use the Promise-returning async members.
export interface CatalogProvider {
  getCategories(): StoreCategory[];
  getProducts(): StoreProduct[];
  getProductById(id: string): StoreProduct | undefined;
  getProductsByCategory(categoryId: string): StoreProduct[];
}
```

### 2.3 `./config` — StoreConfig, StoreVertical

```ts
// src/config/types.ts
import type { StoreTheme } from '../theme/types';
import type { CatalogData } from '../catalog/types';

export interface Brand {
  name: string;              // replaces hardcoded "Boutique Exclusiva"
  tagline?: string;
  copyright: string;         // footer copyright line
}

export interface LogoConfig {
  image?: string;            // preferred: vertical-relative asset key
  icon?: 'Store' | 'ShoppingBag' | 'Package'; // whitelisted lucide fallback when no image
  tintToken?: keyof StoreTheme['colors'];      // which theme color tints the icon
  alt: string;
}

export interface HeroConfig {
  image: string;             // vertical-relative asset key — ACTUALLY rendered (fixes dead legacy field)
  heading: string;
  subheading: string;
  ctaLabel?: string;
  ctaPath?: string;          // route or anchor the CTA points to
  overlayColor?: string;     // e.g. "rgb(0 0 0)"
  overlayOpacity?: number;   // 0..1, replaces hardcoded bg-opacity-50
}

export type NavItemKind = 'route' | 'anchor';
export interface NavItem {
  label: string;
  path: string;              // "/productos" (route) or "#ofertas" (anchor)
  kind: NavItemKind;         // RESOLVES open question: anchors stay a first-class, explicit kind
}

export interface FeatureItem {
  icon: string;              // whitelisted lucide name (Star|Shield|Truck|Package|...)
  title: string;
  description: string;
}

export interface FooterLink { label: string; path: string; kind: NavItemKind }
export interface FooterConfig {
  linkGroups: { title: string; links: FooterLink[] }[];
  contact?: { email?: string; phone?: string; address?: string };
  social?: { platform: string; url: string; icon: string }[];
  copyright: string;
}

export interface StoreConfig {
  vertical: string;          // slug; matches VITE_STORE_VERTICAL and exposed as data-vertical
  brand: Brand;
  locale: string;            // BCP-47, e.g. "es-NI" → Intl.NumberFormat
  currency: string;          // ISO 4217, e.g. "USD" → Intl.NumberFormat
  theme: StoreTheme;
  logo: LogoConfig;
  hero: HeroConfig;
  nav: NavItem[];
  features: FeatureItem[];
  footer: FooterConfig;
  catalog: CatalogData;      // authored inline in store.config.ts OR imported from catalog.json
}

// Descriptor entry in the static vertical registry (resolve-vertical.ts).
export interface StoreVertical {
  slug: string;
  config: StoreConfig;
}
```

Required vs optional (validator-enforced): required = `vertical, brand.name, brand.copyright,
locale, currency, theme (all color/typography/radii keys), logo.alt, hero.image/heading/subheading,
nav (>=1), footer.copyright, catalog.categories (>=1), catalog.products (>=1, unique ids, every
product.categoryId resolves)`. Optional = everything marked `?` above.

---

## 3. ThemeProvider design

### 3.1 Pure mapper `themeToCssVars`

The load-bearing, 100%-unit-tested pure function. Maps camelCase theme keys → the EXACT CSS var
names web-common's `@theme` already generates utilities for.

```ts
// src/theme/theme-to-css-vars.ts
export function themeToCssVars(theme: StoreTheme): Record<string, string> {
  const c = theme.colors, t = theme.typography, r = theme.radii;
  return {
    '--color-primary': c.primary,
    '--color-primary-hover': c.primaryHover,
    '--color-primary-light': c.primaryLight,
    '--color-secondary': c.secondary,
    '--color-accent': c.accent,
    '--color-background': c.background,
    '--color-surface': c.surface,
    '--color-text': c.text,
    '--color-text-muted': c.textMuted,
    '--color-border': c.border,
    '--color-success': c.success,
    '--color-danger': c.danger,
    '--color-warning': c.warning,
    '--color-info': c.info,
    '--font-family': t.fontFamily,
    '--font-family-heading': t.headingFontFamily ?? t.fontFamily,
    '--font-size-base': t.fontSizeBase,
    '--font-size-sm': t.fontSizeSm,
    '--font-size-lg': t.fontSizeLg,
    '--radius-sm': r.sm,
    '--radius-md': r.md,
    '--radius-lg': r.lg,
    '--radius-pill': r.pill,
  };
}
```

### 3.2 Provider + prerender safety + FOUC

Two things must be true simultaneously:
1. **Prerendered HTML already carries the active vertical's tokens** → zero FOUC (the vars are in
   the served HTML before any JS runs).
2. **No unguarded `document`/`window`** during Node prerender (`ssr:false` but prerender executes
   in Node).

Design: `ThemeProvider` renders an **inline `<style>` element** (not `document.documentElement.
style.setProperty`) whose text sets the vars on `:root[data-vertical="<slug>"]`. Because it is
plain JSX, it is emitted into the prerendered HTML in Node with NO document access — this is the
SSR/prerender-safe path AND the FOUC fix in one move. A `useEffect` is only needed if we later add
runtime theme switching; for build-time-selected verticals it is unnecessary.

```tsx
// src/theme/theme-provider.tsx
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { StoreTheme } from './types';
import { themeToCssVars } from './theme-to-css-vars';

const ThemeContext = createContext<StoreTheme | null>(null);

export function useStoreTheme(): StoreTheme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useStoreTheme must be used within <ThemeProvider>');
  return t;
}

export function ThemeProvider({
  theme, vertical, children,
}: { theme: StoreTheme; vertical: string; children: ReactNode }) {
  const css = useMemo(() => {
    const vars = themeToCssVars(theme);
    const body = Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ');
    return `:root{${body}}`;   // applied to root; prerendered inline → no FOUC, no document access
  }, [theme]);
  return (
    <ThemeContext.Provider value={theme}>
      {/* eslint-disable-next-line react/no-danger */}
      <style data-storefront-theme={vertical} dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </ThemeContext.Provider>
  );
}
```

### 3.3 Coexistence with web-common `styles.css`

- web-common's `@theme` literal defaults (deeppurple `rgb(103 58 183)` etc.) **stay untouched** —
  they are what makes Tailwind GENERATE `bg-primary`, `text-text-muted`, `rounded-md`, etc. at
  build time. They act as the neutral fallback.
- `ThemeProvider`'s inline `<style>` re-declares the same `--color-*`/`--radius-*`/`--font-*`
  custom properties at `:root` with **higher-or-equal specificity and later source order** (it is
  injected into the component tree, after the stylesheet link), so the active vertical's values
  win. No rebuild of Tailwind needed.
- Token-name reconciliation is total: TS `textMuted` → `--color-text-muted` (web-common's existing
  name). No new utility classes are introduced; we only override existing ones.
- `--font-family` / `--font-family-heading` are NEW vars not in web-common's `@theme`. To make them
  take effect, the ported components/base layer reference them (e.g. `html { font-family:
  var(--font-family) }`). Since web-common hardcodes Inter on `html`, the storefront app's own base
  layer (in static-store, via a tiny app `styles.css` or a `style` on the layout) applies
  `var(--font-family)`. This is an APP-level base rule, not a web-common change.

---

## 4. Catalog provider seam

### 4.1 Default baked provider (prerender-safe, synchronous)

```ts
// src/catalog/baked-provider.ts
import type { CatalogData, CatalogProvider, StoreProduct } from './types';

export function createBakedCatalogProvider(data: CatalogData): CatalogProvider {
  const byId = new Map<string, StoreProduct>(data.products.map((p) => [p.id, p]));
  return {
    getCategories: () => data.categories,
    getProducts: () => data.products,
    getProductById: (id) => byId.get(id),
    getProductsByCategory: (categoryId) =>
      data.products.filter((p) => p.categoryId === categoryId),
  };
}
```

- Data comes from `StoreConfig.catalog`, which is authored inline in `store.config.ts` or imported
  from a sibling `catalog.json` (`resolveJsonModule` is on). Either way it is a **static import**,
  so React Router's prerender inlines it — `/productos` prerenders with the full product list, zero
  runtime fetch.
- The provider is created once per app (a module singleton in static-store) from the resolved
  config's `catalog`.

### 4.2 Swapping to runtime-fetch / GitOps with zero UI change

The UI depends only on the `CatalogProvider` interface, never on how data is obtained. Two future
paths, both a **one-file swap** of the provider factory:
- **GitOps (path A):** edit `catalog.json` → GitHub Action rebuild+redeploy. Still uses
  `createBakedCatalogProvider`; nothing changes in code. Prerender stays intact.
- **Runtime fetch (path B):** a new `createRemoteCatalogProvider(url)` implements the SAME
  interface but fetches. This moves `/productos` off prerender onto a `clientLoader` (RR7), because
  the data is no longer build-time known. The interface is identical, so components are untouched;
  only the app's route module changes (loader wiring) and `react-router.config.ts` drops
  `/productos` from `prerender`. **This coupling — prerender iff data is build-time resolvable — is
  the documented boundary.** For this change we ship ONLY the baked provider; the seam guarantees
  the swap is localized.

### 4.3 Where JSON lives

`templates/apps/static-store/verticals/{slug}/catalog.json` (co-located with that vertical's
`store.config.ts`). Assets separately under `public/verticals/{slug}/...` (Section 5).

---

## 5. Vertical selection mechanism

### 5.1 Build-time resolution (STATIC registry, no dynamic import)

Dynamic `import()` would defeat prerender inlining and risk async in Node. Instead, a **static
import registry** maps slug → config. `resolveVertical` reads `import.meta.env.VITE_STORE_VERTICAL`
and returns the matching config, falling back to the default.

```ts
// src/config/resolve-vertical.ts
import type { StoreConfig } from './types';

export const DEFAULT_VERTICAL = 'clothes';

// The registry is populated BY THE APP (static-store) which owns the vertical data folders,
// then passed in. The package provides the pure resolver so it stays testable without app data.
export function resolveVertical(
  registry: Record<string, StoreConfig>,
  requested: string | undefined,
  fallback: string = DEFAULT_VERTICAL,
): StoreConfig {
  const slug = requested?.trim() || fallback;
  const config = registry[slug] ?? registry[fallback];
  if (!config) throw new Error(`No vertical config for "${slug}" and no fallback "${fallback}"`);
  return config;
}
```

App-side wiring (static-store owns the static imports so Vite/tree-shaking picks only what ships;
for a single-vertical build this is fine, and prerender-safe because all imports are static):

```ts
// static-store: app/store/verticals.ts
import { clothesConfig } from '../../verticals/clothes/store.config';
// import { demoConfig } from '../../verticals/demo/store.config'; // add-a-folder => add-a-line
export const VERTICALS = { clothes: clothesConfig } as const;

// app/store/active.ts
import { resolveVertical, validateStoreConfig } from '@store-mgmt/storefront/config';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { VERTICALS } from './verticals';

export const activeConfig = validateStoreConfig(
  resolveVertical(VERTICALS, import.meta.env.VITE_STORE_VERTICAL),
);
export const catalog = createBakedCatalogProvider(activeConfig.catalog);
```

> Note on "zero code changes to add a vertical": adding a vertical requires a new data folder PLUS
> one import line in `verticals.ts`. That single registry line is the honest cost of static-import
> prerender safety (the alternative, `import.meta.glob`, is dynamic and breaks the guarantee). The
> spirit of the locked decision holds — no engine/UI code changes, only a data-registration line.

### 5.2 Asset convention + base-path awareness

Per-vertical folders: `public/verticals/{slug}/{logo.*, hero.*, products/**}`. Config asset fields
store vertical-relative keys (e.g. `hero.image = "hero.jpg"`), resolved at render via `withBase`:

```ts
// src/config/asset.ts
// base defaults to Vite's BASE_URL so GH Pages subpath is respected in asset URLs.
export function verticalAsset(
  slug: string, key: string, base: string = import.meta.env.BASE_URL ?? '/',
): string {
  const clean = key.replace(/^\/+/, '');
  return `${base.replace(/\/$/, '')}/verticals/${slug}/${clean}`;
}
export function withBase(path: string, base: string = import.meta.env.BASE_URL ?? '/'): string {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}
```

A required-asset check (test/script) asserts each vertical's config references resolve to existing
files under its `public/verticals/{slug}/` folder.

---

## 6. static-store app structure

### 6.1 Routes

```ts
// app/routes.ts
import { type RouteConfig, index, route } from '@react-router/dev/routes';
export default [
  index('routes/home.tsx'),               // / (landing: Hero + features + featured/offers)
  route('productos', 'routes/products.tsx'),        // /productos (catalog grid + filters)
  route('productos/:id', 'routes/product-detail.tsx'), // client-side over SPA fallback
] satisfies RouteConfig;
```

### 6.2 root.tsx wiring

`root.tsx` `Layout` mounts `ThemeProvider` around `<Outlet/>` content and threads `StoreConfig`
via a lightweight config context (or simply imports `activeConfig` where needed). `data-vertical`
goes on `<html>` for debug/CSS hooks. `ThemeProvider` wraps `{children}` so the inline theme
`<style>` is present in every prerendered document → no FOUC on any route.

```tsx
// app/root.tsx (Layout body sketch)
import { ThemeProvider } from '@store-mgmt/storefront/theme';
import { activeConfig } from './store/active';
// <html lang={activeConfig.locale} data-vertical={activeConfig.vertical}> ... 
// <body><ThemeProvider theme={activeConfig.theme} vertical={activeConfig.vertical}>{children}...
```

### 6.3 Component ownership — package vs app

| Component | Lives in | Reason |
|---|---|---|
| `ThemeProvider`, `useStoreTheme`, `themeToCssVars` | **package** `./theme` | reusable engine |
| `CatalogProvider`, baked provider | **package** `./catalog` | reusable seam |
| `resolveVertical`, `validateStoreConfig`, `formatMoney`, asset helpers | **package** `./config` | pure, reusable |
| `Header`, `Hero`, `ProductCard`, `ProductGrid`/`ProductsPage`, `Footer` | **app** `static-store/app/components/*` | presentation bound to `static-store` routing/layout; consume config + catalog + theme utilities |

Rationale: keep the package free of app routing/layout coupling. Components are thin presentation
reading `StoreConfig` + `CatalogProvider` + Tailwind token utilities (`bg-primary`, `text-text`,
`text-text-muted`, `rounded-md`). They do NOT use inline `style={{color: theme...}}` (that legacy
pattern is replaced by token utilities driven by the runtime CSS vars).

---

## 7. GitHub Pages deploy design

- **`vite.config.ts`**: `base: process.env.VITE_BASE ?? '/'` (set to `/<repo>/` in CI). Threads
  into every asset URL. `withBase`/`verticalAsset` read `import.meta.env.BASE_URL` (Vite derives it
  from `base`) so config-referenced assets resolve under the subpath automatically.
- **`react-router.config.ts`**: `basename: process.env.VITE_BASE ?? '/'`, `ssr: false`,
  `prerender: ['/', '/productos']`. `basename` MUST match Vite `base` or links 404 on Pages.
- **SPA deep-link fallback**: RR7 generates `build/client/__spa-fallback.html`. A deploy step
  copies/renames it to `404.html` at the publish root so GH Pages serves the SPA shell for
  unknown/deep paths (`/productos/:id`, refreshes). This is what keeps client-side product detail
  working.
- **Build/deploy flow**: `VITE_STORE_VERTICAL=clothes VITE_BASE=/<repo>/ pnpm --filter
  @store-mgmt/static-store build` → produces `build/client/`. A deploy script (gh-pages package,
  already in repo) publishes `build/client/` after the `404.html` rename. One artifact per vertical
  (change `VITE_STORE_VERTICAL`).
- **Base-path threading checklist**: (1) Vite `base`, (2) RR `basename`, (3) `import.meta.env.
  BASE_URL` in asset helpers, (4) `<Link>`/route paths use `basename` automatically, (5) raw
  `public/` asset refs in config go through `verticalAsset`/`withBase`, never hardcoded `/...`.

---

## 8. Money helper design

```ts
// src/config/money.ts
const cache = new Map<string, Intl.NumberFormat>();
export function formatMoney(
  amount: number, opts: { locale: string; currency: string },
): string {
  const key = `${opts.locale}|${opts.currency}`;
  let fmt = cache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(opts.locale, { style: 'currency', currency: opts.currency });
    cache.set(key, fmt);
  }
  return fmt.format(amount);
}
```

- Replaces legacy `$${price.toFixed(2)}`. Locale/currency come from `StoreConfig`. `ProductCard`
  calls `formatMoney(product.price, { locale: config.locale, currency: config.currency })`.
- Memoized because `Intl.NumberFormat` construction is comparatively expensive and the grid renders
  many cards.

---

## 9. Testing strategy (Strict TDD)

Every unit below is written test-first (red → green → refactor). Package tests run under Vitest +
jsdom (copy web-common's config).

**Pure units — full unit coverage (write first):**
- `themeToCssVars(theme)` — asserts every token maps to the exact `--color-*`/`--font-*`/`--radius-*`
  var name and value; snapshot the key set to catch drift from web-common's `@theme`.
- `formatMoney` — locale/currency formatting (e.g. `es-NI` USD), memoization returns same instance,
  negative/zero handling.
- `createBakedCatalogProvider` — `getProductById` hit/miss, `getProductsByCategory` filtering,
  categories passthrough, empty-catalog behavior.
- `resolveVertical` — requested slug hit, missing slug → fallback, missing fallback → throws,
  empty/whitespace env → default.
- `validateStoreConfig` — required-field presence, **unique product IDs** (regression test for the
  legacy dup-id bug), `categoryId` referential integrity, `originalPrice > price` sanity, throws
  with actionable messages.
- `verticalAsset`/`withBase` — base-path joining, leading-slash normalization, subpath correctness.

**Component / integration (RTL + jsdom):**
- `ThemeProvider` — renders the inline `<style>` with expected vars; `useStoreTheme` throws outside
  provider; a child reading the var reflects the theme (assert on the emitted CSS text / computed
  var in jsdom).
- `ProductCard` — renders name, `formatMoney` price, `Nuevo`/discount badges from flags, image via
  `verticalAsset`.
- `Header` — brand name from config, nav items render with correct route vs anchor semantics.
- `Hero` — renders `config.hero.image` (regression: hero image actually used, not a dead field),
  heading/subheading/CTA from config.
- `ProductsPage`/`ProductGrid` — category filter + search + sort behavior against a baked provider.
- `Footer` — renders link groups/contact/copyright from config.

**Build/output assertions (lightweight):**
- Required-asset test: every asset key in the `clothes` config resolves to a file under
  `public/verticals/clothes/`.
- Config validity: the `clothes` config passes `validateStoreConfig` (guards the authored data).
- (Optional CI) after build, assert `404.html` exists at publish root and prerendered
  `productos/index.html` contains product markup (prerender-of-catalog smoke check).

---

## 10. Resolved open questions & key tradeoffs

| Open question (proposal) | Resolution | Rationale |
|---|---|---|
| **FOUC / which vertical is the baked default** | No single "baked default vertical" needed. `ThemeProvider` emits an inline `<style>` that is PART of the prerendered HTML, so every build already ships its active vertical's tokens in the served document. web-common's existing `@theme` literals remain the neutral fallback that lets Tailwind generate utilities. `DEFAULT_VERTICAL='clothes'` only covers a missing/empty `VITE_STORE_VERTICAL`. | Eliminates FOUC without a special-case default, and avoids a rebuild-per-preview. Prerender-safe (no `document` access). |
| **Prerender vs runtime-fetch for `/productos`** | Ship ONLY the synchronous baked provider; `/productos` stays prerendered. The `CatalogProvider` interface is the swap seam: a future `createRemoteCatalogProvider` moves `/productos` to a `clientLoader` and drops it from `prerender`. Boundary documented: prerender iff data is build-time resolvable. | Keeps the static GH Pages deploy simple now; makes the future swap a localized, well-defined change with zero UI edits. |
| **Do web-common primitives need token wiring?** | NO — do not modify `web-common` in this change. Ported components live in `static-store` and use `@theme` token utilities directly. `Card`/`Spinner`/`LoadingOverlay` stay as-is; if reused they render with their current gray classes. Tokenizing them is a flagged follow-up. | Keeps blast radius to the new package + `static-store`. Avoids broad `web-common` regression risk mid-change. |
| **Nav link semantics (route vs anchor)** | Model BOTH via `NavItem.kind: 'route' | 'anchor'`. `Header` renders `<Link>` for routes and `<a href="#...">` for anchors. | Preserves legacy behavior (mixed nav) as explicit data; no dropped functionality. |
| **Package name / catalog location** | LOCKED: `@store-mgmt/storefront`, single package, catalog seam inside it (`./catalog`). | Per locked decisions. |
| **Product attributes (variants)** | Not built. Size/color stay free-text in `description`. Flagged limitation. | Per non-goals. |

### Tradeoffs accepted
- **Static import registry line per vertical** (Section 5.1) vs `import.meta.glob`: chose static for
  prerender safety; costs one registration line when adding a vertical. Documented as honest cost.
- **Components in app, not package**: less "reusable across apps" but avoids coupling the engine to
  `static-store` routing/layout. The reusable value is the engine (`./theme`/`./catalog`/`./config`),
  which is what other apps would consume.
- **Sync-first `CatalogProvider`**: optimizes for the current static/prerender case; the async swap
  is a deliberate, documented later change rather than pre-built abstraction (YAGNI).

### Still needing YOUR decision (non-blocking for spec)
- **`VITE_BASE` value**: exact GH Pages subpath (`/public-clothes-store-demo/`?) — needed at deploy
  wiring time, not for spec/tasks. Assumed derived from repo name.
- **Second minimal `demo` vertical**: proposal says "optionally one." Design supports it at zero
  engine cost (one registry line + data folder). Recommend authoring a tiny `demo` to prove the
  switch in an automated test; confirm if you want it in scope now or deferred.
```
