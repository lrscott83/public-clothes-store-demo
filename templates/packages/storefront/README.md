# @store-mgmt/storefront

The pure "verticals-as-data" engine behind the themeable storefront
template. This package owns the reusable, framework-thin building blocks;
it has **no vertical data, no routes, and no presentational components** —
those live in the consuming app (`templates/apps/static-store`).

See `templates/apps/static-store/README.md` for the full guide: what a
vertical is, how to add one, how theming works end-to-end, and how to
deploy to GitHub Pages. This file only documents the package's own shape.

## Subpath exports

- `@store-mgmt/storefront/config` — `StoreConfig`/`StoreVertical`/`Brand`/
  `HeroConfig`/`NavItem`/`FeatureItem`/`FooterConfig` types;
  `resolveVertical()`, `validateStoreConfig()`, `formatMoney()`,
  `withBase()`/`verticalAsset()`. Plain TypeScript, no React — safe to use
  during Node-side prerendering.
- `@store-mgmt/storefront/catalog` — `StoreProduct`/`StoreCategory`/
  `CatalogData`/`CatalogProvider` types; `createBakedCatalogProvider()`.
  Also plain TypeScript, no React.
- `@store-mgmt/storefront/theme` — `StoreTheme` type; `ThemeProvider`,
  `useStoreTheme()`, `themeToCssVars()`. The only React-dependent layer.

## Base-path-aware assets

`withBase(path, base?)` and `verticalAsset(slug, key, base?)` build
base-prefixed URLs for GitHub Pages project-page deploys. When `base` is
omitted, both default to `import.meta.env.BASE_URL` (the value Vite
populates from its `base` config option, itself threaded from `VITE_BASE`
at build time — see the static-store README's deploy section), so callers
in a vertical's `store.config.ts` never need to pass it explicitly.

## Testing

`pnpm --filter @store-mgmt/storefront test` runs the full unit/RTL suite
(Vitest + Testing Library) for every unit in this package under Strict TDD
(tests were written RED-first for each unit).
