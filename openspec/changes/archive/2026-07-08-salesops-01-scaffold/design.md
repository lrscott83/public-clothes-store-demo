# Design: salesops-01-scaffold (App Skeleton)

## Technical Approach

Copy-local, isolated workspace app `@store-mgmt/salesops-mvp` at `templates/apps/salesops-mvp`, mirroring `static-store` config verbatim minus verticals/GH-Pages machinery. React Router v7 framework mode, client-only SPA (`ssr:false`), Tailwind v4 via `@tailwindcss/vite`, strict-TDD vitest. A `_shell` layout route renders the sidebar once and wraps the 7 screen placeholders via `<Outlet/>`. `@store-mgmt/domain` stays OUT of the skeleton (its `tsc`→`dist` build step complicates the scaffold); reuse only raw-source packages `storefront` (types/helpers) and `web-common` (UI). Confirmed stance.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Isolation | Copy-local app, no shared extraction | Extract ProductCard/catalog to `packages/*` | MVP speed; matches app-local precedent; avoids touching static-store |
| Domain types | Keep `@store-mgmt/domain` OUT | Import domain for typing placeholders | Domain needs `tsc` build before consumers resolve `dist/`; storefront serves raw `src` (no build). Task 2 wires domain later |
| Router shape | RR7 `layout()` shell wrapping index + 7 children | Manual sidebar in each route; nested `root.tsx` only; chrome-free index outside shell | Sidebar renders once via `<Outlet/>`; index is a welcome/overview page INSIDE the shell so the sidebar is always visible (LOCKED) |
| Catalog reuse | Copy `catalog.json` + images into app `public/` | Cross-app relative import; shared data package | No cross-app import precedent; simplest; typed as `CatalogData` from storefront |
| ProductCard | Copy-adapt local component | Add shared subpath export to storefront | ProductCard is already app-local in static-store; copy keeps blast radius zero |
| Charts | DEFERRED to Tasks 6/7 | Pick library now | No dashboards in Task 1; no lib in workspace yet — premature |
| Dev port | 3355 | 3344 (collides with static-store) | Runs concurrently with static-store |

## Data Flow

    root.tsx (Layout: <html> shell, web-common/styles.css + app.css, ThemeProvider)
       └─ App() <Outlet/>
            └─ _shell.tsx layout → <Sidebar/> (always visible) + <Outlet/>
                 ├─ home.tsx  index "/"  → welcome/overview page
                 └─ 7 screen placeholders (pedidos/nuevo, operador-gestores,
                    operador-almacen, tasas, inventario, decisiones, finanzas)

    app/data/catalog.ts → import public catalog.json → createBakedCatalogProvider (CatalogData typed)
       → local resolveCatalogImage(path) → /catalog/appliances/products/... (BASE_URL prefix, no verticalAsset)

## File Changes

| File | Action | Notes |
|---|---|---|
| `package.json` | Create | Name `@store-mgmt/salesops-mvp`; scripts build/dev/dev:local/start/lint/typecheck/clean/test mirrored. DROP `build:pages*`/`deploy`/`gh-pages` dep. Deps: `@react-router/node`,`@react-router/serve`,`@store-mgmt/storefront`,`@store-mgmt/web-common`,`isbot`,`lucide-react`,`react`,`react-dom`,`react-router`. NO `@store-mgmt/domain`. Same devDeps minus gh-pages |
| `vite.config.ts` | Create | ALL 4 gotchas: `css.postcss.plugins:[]`; `resolve.dedupe:['react','react-dom','react-router']`; `resolve.alias:{'react-router-dom':'react-router'}`; `optimizeDeps.include` storefront subpaths (`/theme`,`/catalog`,`/config`). Port **3355** (server+preview) |
| `react-router.config.ts` | Create | `ssr:false`; **`prerender:['/']` LOCKED** (static index.html for static hosting / GitHub Pages, matching static-store SPA deploy); future flags v8_middleware/v8_splitRouteModules/v8_passThroughRequests/v8_trailingSlashAwareDataRequests TRUE, **v8_viteEnvironmentApi OFF**. basename from `VITE_BASE` (kept for parity) |
| `tsconfig.json` | Create | Self-contained (does NOT extend `@store-mgmt/typescript-config` stub). Mirror static-store: ES2022, bundler res, jsx react-jsx, `rootDirs:['.','./.react-router/types']`, paths `{'~/*':['./app/*']}`, strict, verbatimModuleSyntax, resolveJsonModule |
| `eslint.config.mjs` | Create | `import config from '@store-mgmt/eslint-config/react-router'; export default config;` |
| `vitest.config.ts` | Create | tsconfigPaths; globals, jsdom, setup `./vitest.setup.ts`, include `['app/**/*.test.{ts,tsx}']` (drop `verticals/**` glob) |
| `vitest.setup.ts` | Create | `import '@testing-library/jest-dom';` |
| `app/root.tsx` | Create | Layout `<html>` shell (Meta/Links/Scripts/ScrollRestoration), imports web-common styles + app.css; `App()` renders `<Outlet/>`; `ErrorBoundary()`. NO verticals/favicon machinery |
| `app/app.css` | Create | Tailwind v4 `@layer base/utilities`, layered after web-common styles |
| `app/routes.ts` | Create | `layout('routes/_shell.tsx',[ index('routes/home.tsx'), route('pedidos/nuevo',...),'operador-gestores','operador-almacen','tasas','inventario','decisiones','finanzas' ])` — index nested INSIDE the shell |
| `app/routes/_shell.tsx` | Create | Sidebar layout (always visible): `<Sidebar/>` + `<Outlet/>` |
| `app/routes/home.tsx` | Create | Index welcome/overview placeholder rendered inside the sidebar shell |
| `app/routes/{pedidos-nuevo,operador-gestores,operador-almacen,tasas,inventario,decisiones,finanzas}.tsx` | Create | 7 placeholder stubs; typed `Route` from `./+types/<name>`; `meta()` |
| `app/components/sidebar.tsx` | Create | Nav links to the 7 screens, lucide-react icons, active state |
| `app/components/product-card.tsx` | Create | Copy-adapt: `formatMoney` from storefront/config, `StoreProduct` from storefront/catalog. Same props `{product,locale,currency}` |
| `app/data/catalog.ts` | Create | Import local `public/catalog/appliances/catalog.json`, typed `CatalogData`, `createBakedCatalogProvider`, local `resolveCatalogImage` |
| `public/catalog/appliances/catalog.json` | Create | Copied from static-store verticals/appliances |
| `public/catalog/appliances/products/**` | Create | Copied referenced product images |

## Interfaces / Contracts

```ts
// app/data/catalog.ts
import type { CatalogData, CatalogProvider } from '@store-mgmt/storefront/catalog';
export const catalogProvider: CatalogProvider;               // baked, sync
export function resolveCatalogImage(path: string): string;   // BASE_URL + local prefix
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Sidebar renders 7 nav links; ProductCard formats price via formatMoney | RTL render, jsdom |
| Integration | Router resolves `/` welcome index + each of 7 routes to its placeholder; `_shell` renders sidebar once and stays visible on every route | RTL + createMemoryRouter/RoutesStub |

TDD-first: write the route-resolution + sidebar test before wiring routes.

## Migration / Rollout

No migration. New app added to existing pnpm/turbo workspace; picked up by `apps/*` glob. Runs via `pnpm --filter salesops-mvp dev` on port 3355 alongside static-store (3344).

## Where Later Tasks Plug In

- Task 2: seed-data gen, localStorage, order state machine, domain-model types → `app/data/` + new `app/store/`; wires `@store-mgmt/domain` (add dep + build).
- Tasks 3-9: replace each `app/routes/*` placeholder body with real screen logic.
- Tasks 6/7: choose chart library (deferred), build Decisiones/Finanzas dashboards.

## Open Questions

None. Both prior questions resolved and locked:
- Index page lives INSIDE the `_shell` sidebar layout as a welcome/overview page (sidebar always visible).
- `prerender:['/']` is ENABLED (static index.html for GitHub Pages / static hosting, matching static-store's SPA deploy).
