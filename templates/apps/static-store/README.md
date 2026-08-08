# @store-mgmt/static-store

A themeable, static-first storefront template built on React Router 7 (SPA
mode, prerendered) and the `@store-mgmt/storefront` engine package
(`templates/packages/storefront`).

The core idea: **a "vertical" (a store) is DATA, not code.** The app, its
routes, and its UI components are shared and generic; a vertical is a brand,
a color theme, a nav/hero/footer configuration, and a product catalog,
expressed as plain TypeScript + JSON + static assets. Re-skinning the
storefront for a new business — different name, colors, copy, and products —
never requires touching a component or a route.

This repo ships two example verticals to prove that:

- `verticals/clothes/` — a real, full-content Nicaraguan clothing store
  (`Boutique Exclusiva`, Spanish copy, `es-NI`/NIO pricing, 17 categories).
- `verticals/demo/` — a small, intentionally generic demo vertical (English
  copy, `en-US`/USD pricing, a different color theme) that exists purely to
  prove the mechanism works with zero engine changes.

## How a vertical works

Each vertical lives under `verticals/<slug>/` and consists of:

- `store.config.ts` — exports a `StoreConfig` (typed by
  `@store-mgmt/storefront/config`): brand, locale/currency, theme, logo,
  hero, nav, features, footer, and the catalog (built from `catalog.json`).
- `catalog.json` — the product/category data. Product `image` fields are
  vertical-relative keys (e.g. `"products/camisas/camisa1.jpg"`), resolved
  in `store.config.ts` via `verticalAsset(slug, key)` so the final URL is
  always base-path aware (see **Deploying to GitHub Pages** below) — never
  hardcode an absolute `/…` path in the JSON.
- `public/verticals/<slug>/**` — the actual image files referenced by the
  catalog and hero/logo config, served as static assets.

At build/dev time, `VITE_STORE_VERTICAL` selects which vertical is active
(`app/store/active.ts` resolves it via `resolveVertical()`, validates it via
`validateStoreConfig()`, and wraps its catalog in
`createBakedCatalogProvider()`). Unset/empty falls back to the `clothes`
vertical (`DEFAULT_VERTICAL` in `@store-mgmt/storefront/config`).

## How to add a new vertical

1. Create `verticals/<name>/store.config.ts` exporting a `StoreConfig` and
   `verticals/<name>/catalog.json` with your categories/products. Use an
   existing vertical (`verticals/clothes/` or `verticals/demo/`) as a
   starting template.
2. Add your images under `public/verticals/<name>/` (e.g.
   `public/verticals/<name>/hero.jpg`,
   `public/verticals/<name>/products/<category>/<file>`), matching the keys
   referenced from `catalog.json`.
3. Register the vertical with **one line** in
   `app/store/verticals.ts`:

   ```ts
   import { myStoreConfig } from '../../verticals/my-store/store.config';

   export const VERTICALS: Record<string, StoreVertical> = {
     clothes: { slug: 'clothes', config: clothesConfig },
     demo: { slug: 'demo', config: demoConfig },
     'my-store': { slug: 'my-store', config: myStoreConfig },
   };
   ```

4. Build (or run dev) with your vertical selected:

   ```bash
   VITE_STORE_VERTICAL=my-store pnpm --filter @store-mgmt/static-store build
   # or, for local dev:
   VITE_STORE_VERTICAL=my-store pnpm --filter @store-mgmt/static-store dev
   ```

That's it — no component, route, or engine-package change is required.
`verticals/demo/` was added exactly this way, as a live proof of the claim
(see `app/__tests__/switchability.test.ts`).

Optional: add `verticals/__tests__/<name>-config.test.ts` (mirroring
`clothes-config.test.ts`/`demo-config.test.ts`) asserting
`validateStoreConfig(myStoreConfig)` passes and every referenced asset
resolves to a real file under `public/verticals/<name>/`.

## How theming works

`StoreConfig.theme` (a `StoreTheme`: colors, typography, radii) is applied
at runtime by `ThemeProvider` (`@store-mgmt/storefront/theme`), mounted in
`app/root.tsx`. `ThemeProvider` renders an inline `<style>` tag writing CSS
custom properties (`--color-*`, `--font-*`, `--radius-*`) onto `:root`. This
is pure JSX — no `document`/`window` access — so it is prerender-safe: the
correct theme is already baked into the prerendered HTML, with no
flash-of-unstyled-content on load.

Components (`app/components/*`) never use inline styles; they read the CSS
variables via Tailwind utility classes (`bg-primary`, `text-text-muted`,
`rounded-md`, …) defined against those custom properties in
`@store-mgmt/web-common`'s `@theme` block, which supplies neutral literal
defaults for utility generation. The `ThemeProvider`'s inline `<style>`
overrides those defaults per-vertical by CSS source order.

## Deploying to GitHub Pages

The build is a **static SPA** (`ssr: false`, no server runtime) with two
routes prerendered to static HTML (`/` and `/productos` — see
`react-router.config.ts`); product detail (`/productos/:id`) resolves
client-side against the catalog provider and is intentionally not
prerendered.

### Base path (`VITE_BASE`)

GitHub Pages *project* pages (as opposed to a user/org page) serve a repo
at `https://<user>.github.io/<repo>/`, i.e. under a subpath, not the domain
root. Both Vite's asset `base` (`vite.config.ts`) and React Router's
`basename` (`react-router.config.ts`) read the same `VITE_BASE` env var so
they always stay in sync:

```ts
// vite.config.ts
const base = process.env.VITE_BASE || '/';
export default defineConfig({ base, /* ... */ });

// react-router.config.ts
const basename = process.env.VITE_BASE || '/';
export default { /* ... */ basename } satisfies Config;
```

Set `VITE_BASE=/<repo>/` (leading and trailing slash) when building for a
GitHub Pages project page; leave it unset (defaults to `/`) for local dev,
a custom domain, or a user/org page served at the domain root.

Every image/asset URL built via `verticalAsset()`/`withBase()`
(`@store-mgmt/storefront/config`) also picks up the same base automatically
— they default their `base` argument to `import.meta.env.BASE_URL`, which
Vite populates from the `base` config above, so vertical `store.config.ts`
files never need to know about `VITE_BASE` directly.

### Build + flatten + 404 fallback

Run:

```bash
VITE_BASE=/<repo>/ pnpm --filter @store-mgmt/static-store run build:pages
```

This runs `react-router build`, then `scripts/prepare-pages-build.mjs`,
which does two things `react-router build` does not do on its own:

1. **Flattens basename-nested prerendered HTML.** When `basename` is a
   subpath, React Router's prerenderer physically writes HTML nested under
   that subpath on disk (`build/client/<repo>/index.html`), while JS/CSS
   and static assets stay at the build root (`build/client/assets/**`,
   `build/client/verticals/**`) — matching Vite's own asset-emission model.
   GitHub Pages project pages already prepend `/<repo>/` to every served
   URL based on the repo name (branch root → `/<repo>/`), not on-disk
   structure, so publishing the raw build output would double-nest the
   HTML at the wrong URL. The script moves the nested HTML back up to the
   build root so the published tree matches what GitHub Pages actually
   serves.
2. **Renames the SPA fallback shell to `404.html`.** GitHub Pages has no
   server-side rewrites, so a direct request or refresh on a client-only
   route 404s unless GitHub Pages is given a `404.html` to fall back to.
   React Router's `__spa-fallback.html` (the same prerendered app shell,
   without route-specific data) is renamed to `404.html` at the publish
   root; the client-side router then takes over and renders the correct
   route once it loads.

### Publish

```bash
VITE_BASE=/<repo>/ pnpm --filter @store-mgmt/static-store run deploy
```

Runs the same build + flatten + 404 steps, then publishes
`build/client/` via [`gh-pages`](https://www.npmjs.com/package/gh-pages) to
the `gh-pages` branch.

The default `pnpm --filter @store-mgmt/static-store build` script is left
unchanged — it always builds with `base: '/'` (no `VITE_BASE` needed) for
local `preview`/non-Pages hosting.

### Out of scope: editing content on GitHub Pages

GitHub Pages is a **read-only static host** — there is no runtime to edit a
vertical's catalog or config after deploy. Content changes go through a
normal Git commit + rebuild + redeploy cycle. A future admin UI for
editing catalog/config at runtime, or a GitOps-style workflow that commits
`catalog.json` changes and triggers a rebuild via CI, is explicitly out of
scope for this template.

## The catalog seam is swappable

`CatalogProvider` (`@store-mgmt/storefront/catalog`) is a small interface —
`getCategories()`, `getProducts()`, `getProductById()`,
`getProductsByCategory()` — implemented synchronously by
`createBakedCatalogProvider()` against the vertical's baked `catalog.json`.
This is a deliberate seam: a future remote/runtime catalog source (e.g. a
headless CMS, a database-backed API, or a GitOps pipeline that rebuilds on
`catalog.json` commits) can implement the same interface without touching
any component or route. The tradeoff of the current implementation is that
because the baked provider resolves synchronously at build time, `/productos`
can be fully prerendered; a future async/remote provider would need to move
that route's data loading to a `clientLoader` and drop it from the
`prerender` list in `react-router.config.ts`.
