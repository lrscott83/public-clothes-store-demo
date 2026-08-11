# Tasks: public-catalog

Branch `public-catalog` (off `main`). **Commits only — no PRs, no PR chaining.**
Strict TDD: every implementation task is preceded by its failing test (RED → GREEN).
Commit-sized work units per `work-unit-commits`: one purpose, tests included, message
explains the outcome. Runners: NestJS apps + `infra-storage` → jest, co-located
`*.spec.ts` (+ `test/*.e2e-spec.ts` + supertest); `web-catalog` → vitest + jsdom +
testing-library. Lint: NestJS `--max-warnings 0`, `web-catalog` `--max-warnings 5`.

Deferred, not tasked here (owner decision, design §9): multi-currency normalisation,
slug→company cache, orphaned-image sweeper. Do not add tasks for these.

## Review Workload Forecast (commits-only — no PRs)

| Field | Value |
|---|---|
| Delivery strategy | commits only, single branch, no PRs/chaining |
| Estimated total changed lines | ~3200-4800 (2 new apps + 1 new package + cross-package edits, incl. scaffold boilerplate + tests) |
| 400-line budget risk | N/A — not a PR-review artifact in this flow |
| Largest phases | Phase 4 (`api-public`, ~800-1200) and Phase 6 (`web-catalog` admin, ~700-1000) — both already split into 6-7 single-purpose commits below, not one commit |
| Commits that must NOT be squashed together | Each RED/GREEN pair in Phases 0-4 (~24 commits); admin products/categories/image-upload kept as 3 separate commits in Phase 6, not one "admin CRUD" commit |

Decision needed before apply: No
Chained PRs recommended: No (commits-only delivery, explicitly out of scope)
Chain strategy: N/A
400-line budget risk: N/A (commits-only)

## Phase 0 — Risk Spikes (run first, before Phase 1)

| Spike | Placement reason |
|---|---|
| 0.1 Wildcard subdomain | Owner-flagged "cheapest possible proof, first." If `*.localhost` Host headers don't survive Vite's dev server + a bare Nest listener, §1's whole one-deployment shape needs rework before any guard/route code exists |
| 0.2 Guard schema-independence | Zero scaffolding — tests EXISTING `PrismaCompanyRepository`/`PrismaMasterService` directly. D2's "the guard needs no scope of its own" claim is the foundation of `api-public`; cheaper to falsify now than after the guard is built on it |
| 0.3 `sharp` toolchain | Native binary. Must install/run in pnpm/turbo before Phase 2 is designed around it |
| 0.4 `MN` formatter | The one Risk-table entry rated High likelihood; isolated pure function, doesn't gate other spikes, but rides on 0.1's `web-catalog` skeleton so it's proven before deeper Phase 5 work |
| 0.5 Mounted volume | **Cannot** run before an adapter exists to write/read through — moved to Phase 2.6, right after `FsProductImageStore` lands, still pulled forward of the full upload+serving feature (Phases 3-4) |

- [ ] 0.1a Scaffold bare `apps/api-public` (Nest, `GET /health` only, no tenant resolution — §3) and bare `apps/web-catalog` (RR7, one loader echoing `request.headers.get('host')`).
- [ ] 0.1b Proof: `curl -H "Host: default.localhost:3000"` reaches both dev servers with the header intact. If Vite rejects it, fix via `server.allowedHosts` as part of GREEN (config, not redesign). Document result in each app's README.
- [ ] 0.2 Proof: a test calling `PrismaCompanyRepository.findById` (existing method) with NO `tenantContext.run(...)` wrapper succeeds — confirms `PrismaMasterService` is schema-independent (D2). Commit as `packages/infra-db/src/company/prisma-master-independence.spec.ts`.
- [ ] 0.3 Proof: add `sharp` to a scratch script in `packages/infra-storage` scaffold (package.json only), run `pnpm install` + a one-line decode/encode smoke test. Document install size/behaviour in the package README.
- [ ] 0.4a RED: `apps/web-catalog/app/shared/lib/money.test.ts` — asserts `Intl.NumberFormat({currency:'MN'})` throws (proves the risk), then asserts the local formatter returns a string for `MN` without throwing (spec: public-catalog "MN formats without throwing").
- [ ] 0.4b GREEN: `apps/web-catalog/app/shared/lib/money.ts` — explicit `MN` branch; USD/EUR fall through to `Intl.NumberFormat` (spec: "USD/EUR format normally").

**Done when**: both curls in 0.1b succeed (or the config fix is committed and re-proven), 0.2's test is green against existing code, 0.3's smoke script runs in this repo's pnpm/turbo, 0.4's RED test fails then passes. 5 commits.

## Phase 1 — Cross-Package Foundations

- [ ] 1.1 RED: `packages/infra-db/src/company/prisma-company.repository.spec.ts` — `findBySlug` resolves an existing company incl. `isActive`/`schemaName`; returns `null` for unknown slug (spec: salesops-companies, both scenarios).
- [ ] 1.2a GREEN: add `findBySlug(slug): Promise<Company | null>` to `packages/domain/src/company/company-repository.port.ts` (additive).
- [ ] 1.2b GREEN: implement in `packages/infra-db/src/company/prisma-company.repository.ts` — `slug` already `@unique`, no migration.

**Done when**: 1.1 is green, existing `ICompanyRepository` consumers untouched. 1 commit.

- [ ] 1.3 RED: `packages/domain/src/product/product-image-store.port.test.ts` — `assertProductImageRef` accepts `products/<uuid>.webp` and seeded shapes (`products/cafeteras/cafeteras1.jpeg`); rejects `..`, leading `/`, `\`.
- [ ] 1.4 GREEN: create `packages/domain/src/product/product-image-store.port.ts` — `IProductImageStore`, `PRODUCT_IMAGE_STORE` symbol, `assertProductImageRef` (D1).

**Done when**: 1.3 is green; no filesystem/adapter code in this file. 1 commit.

- [ ] 1.5 RED: `packages/infra-db/src/product/prisma-product.repository.spec.ts` — `search` does case-insensitive `OR` over name/description; list behaviour unchanged when `search` is absent (spec: public-catalog "Case-insensitive search matches name and description").
- [ ] 1.6a GREEN: add `search?: string` to `ProductListFilter` in `packages/domain/src/product/product-repository.port.ts` (additive).
- [ ] 1.6b GREEN: implement in `packages/infra-db/src/product/prisma-product.repository.ts` — `contains` + `mode: 'insensitive'` on name/description.

**Done when**: 1.5 is green AND full existing `prisma-product.repository.spec.ts` suite stays green with zero edits to pre-existing assertions. 1 commit.

- [ ] 1.7 Add `frozenStorefrontBoundaryRule` (forbids `@store-mgmt/storefront*` in `web-catalog`) and `frozenLegacyAppRule` (forbids `@store-mgmt/domain*` in `apps/static-store`) to `packages/eslint-config/backend-boundaries.config.js`. No test harness exists for this package (repo convention) — verify manually: a scratch import of `@store-mgmt/storefront` inside a `web-catalog` file is rejected once 1.7 is wired in Phase 5/6; static-store today has 0 domain imports (explore.md claim 10, verified exhaustively) so the rule change alone produces 0 new lint errors.

**Done when**: both rules exist and are exported; not yet wired anywhere (wiring is 1.8 and Phase 5's scaffold). 1 commit.

- [ ] 1.8 **Own commit, no other change bundled.** One-line edit: `apps/static-store/eslint.config.mjs` — import and spread `frozenLegacyAppRule` (mirrors the existing `webBackendBoundaryRule` line). No runtime code touched.

**Done when**: `pnpm --filter static-store lint` passes with 0 new violations; `pnpm --filter static-store build` output is unchanged (byte-identical). This is the ONLY authorised edit to a frozen app in this change. 1 commit.

## Phase 2 — `packages/infra-storage` (NEW package)

- [ ] 2.1 RED: `packages/infra-storage/src/product-image/fs-product-image.store.spec.ts` — put→open round trip on a tmpdir; `open()` returns `null` for a missing ref; ref rejection reuses 1.3's `assertProductImageRef` (`..`, absolute, backslash).
- [ ] 2.2 GREEN: `packages/infra-storage/src/product-image/fs-product-image.store.ts` — `FsProductImageStore implements IProductImageStore`, resolves under `<STORAGE_PATH>/<companyId>/`, streams (never buffers, D6/D1). Scaffold package.json/tsconfig (jest, mirroring `infra-db`'s `.spec.ts` convention) + `infra-storage.module.ts` binding `PRODUCT_IMAGE_STORE`.

**Done when**: 2.1 is green; package auto-registers via `pnpm-workspace.yaml`'s `packages/*` glob (no manual wiring needed). 1 commit.

- [ ] 2.3 RED: `packages/infra-storage/src/product-image/normalize-image.spec.ts` — EXIF rotate honoured; output is always `webp`; oversize (`>1600px`) downscaled, `withoutEnlargement`; non-image input → decode error, never a throw that crashes the process (D10).
- [ ] 2.4 GREEN: `packages/infra-storage/src/product-image/normalize-image.ts` — the only file importing `sharp`: `.rotate()` → `.resize({width:1600, withoutEnlargement:true})` → `.webp({quality:82})`.

**Done when**: 2.3 is green using the `sharp` dependency proven installable in spike 0.3. 1 commit.

- [ ] 2.5 Spike 0.5 proof, now unblocked: write a file via `FsProductImageStore.put()` under a FIXED `STORAGE_PATH` (not a tmpdir), kill and restart the test process, confirm `open()` still resolves the bytes. Document `STORAGE_PATH` + volume requirement in `packages/infra-storage/README.md`.
- [ ] 2.6 Explicitly flagged, not silently dropped: full container-volume-mount proof (docker-compose service definition) is **not** in this task list — no compose file wires `api-public`/`api-salesops`/`web-catalog` in this repo today, and design §4's file map does not name one. 2.5's process-restart proof covers the mechanism the feature depends on (stable path outlives the writing process); actual container deployment config is a follow-up if/when a real deployment target is defined.

**Done when**: 2.5's restart proof passes and the README documents the requirement + the 2.6 scope note. 1 commit.

## Phase 3 — `apps/api-salesops`: authenticated image upload

- [ ] 3.1 RED: `apps/api-salesops/src/product/product.controller.spec.ts` — owner/admin uploads a valid JPEG → `Product.image` updated to relative path; non-owner/admin → rejected, `Product.image` unchanged; oversized file rejected before storage; disallowed MIME rejected, nothing written; stored extension derives from validated MIME, never the client filename (spec: salesops-products, all scenarios).
- [ ] 3.2 GREEN: `POST /products/:id/image` in `apps/api-salesops/src/product/product.controller.ts` — `FileInterceptor('image')` + `ParseFilePipe([MaxFileSizeValidator(10MB), FileTypeValidator(/^image\/(jpeg|png|webp|heic|heif)$/)])`, `@Roles(owner, admin)`, same guard chain, same `runInTenant`; calls `store.put()` → `normalize-image` → `productRepository.update(id, {image: ref})`.
- [ ] 3.3 `apps/api-salesops/src/product/product.module.ts` — import `InfraStorageModule`, provide `PRODUCT_IMAGE_STORE`.
- [ ] 3.4 Regression: run full existing `apps/api-salesops` jest + e2e suites unmodified — confirm `search` (1.5/1.6) absent from `list` params leaves `list` behaviour byte-identical, and no pre-existing test needed an edit.

**Done when**: 3.1 is green and the full pre-existing `api-salesops` suite is still green with zero edits to pre-existing test files. 1 commit.

## Phase 4 — `apps/api-public` (NEW app)

- [ ] 4.1 RED: `apps/api-public/src/tenant/host-slug.spec.ts` — parse table: strips port, prefers `X-Forwarded-Host` over `Host`, single-label host, reserved label (`www`/`api`/`admin`), bad chars.
- [ ] 4.2 GREEN: `apps/api-public/src/tenant/host-slug.ts` — pure, Nest-free (D2).

**Done when**: 4.1 is green. 1 commit.

- [ ] 4.3 RED: `apps/api-public/src/tenant/public-tenant.guard.spec.ts` — unknown slug, inactive company, `schemaName: null` all → `404`, and asserts the three responses are byte-identical (spec: salesops-tenancy, D4); asserts `JwtAuthGuard`/Membership branch/`RolesGuard` are never invoked.
- [ ] 4.4 GREEN: `apps/api-public/src/tenant/public-tenant.guard.ts` + `run-in-tenant.ts` (5-line copy, D3) — resolves via `findBySlug` (1.2), opens `tenantContext.run(...)` directly (D2), using 0.2's proven schema-independence.

**Done when**: 4.3 is green including the byte-identical assertion. 1 commit.

- [ ] 4.5 RED: `apps/api-public/src/product/public-product.service.spec.ts` — fixture where `order` and `finalPrice` disagree, asserts sort-then-paginate correctness; page boundaries and `total` vs page length exact (spec: public-catalog, "Sorts by finalPrice", "Page 2 reflects the global sort").
- [ ] 4.6 GREEN: `apps/api-public/src/product/public-product.service.ts` — filters `active:true` + category + search server-side, computes `finalPrice` via imported `packages/domain` pricing (never SQL/browser), sorts in memory, slices (D5). `WARN` log tripwire at >2000 materialized rows.

**Done when**: 4.5 is green; no reimplementation of pricing math in this file. 1 commit.

- [ ] 4.7 RED: DTO contract test — response key set equals the §3 allow-list (no `cost`/`sku`/`barcode`) AND every field's value type matches (decimal strings for `percentDiscountPrice`/`discountPrice`/both `amount`s — a JSON number is a FAILURE) (spec: public-catalog, "cost/sku/barcode absent", "Both discounts returned uncollapsed").
- [ ] 4.8 GREEN: `apps/api-public/src/product/dto/*.ts` (`PublicProductDto` per §3 table), `public-product.controller.ts` (`GET /public/products`, `/public/products/:id`), `category/`, `store/`, `health/` modules (§3).

**Done when**: 4.7 is green. 1 commit.

- [ ] 4.9 RED: `apps/api-public/src/product/product-image.controller.spec.ts` + `image-url.spec.ts` — 404 matrix (absent, inactive, cross-tenant, stale `imageKey`, invalid ref, `open()` null); `ETag`/`304`/`Cache-Control` header exactness (D6, spec: public-catalog image scenarios).
- [ ] 4.10 GREEN: `apps/api-public/src/product/image-url.ts` (assembles `/public/products/:id/image/:imageKey`) + `product-image.controller.ts` — streams via `IProductImageStore.open()`, never buffers.

**Done when**: 4.9 is green. 1 commit.

- [ ] 4.11 `apps/api-public/test/*.e2e-spec.ts` + `jest-e2e.json` — two slugs against ONE app instance; isolation proven from the `Host` header alone (mirrors 0.1's proof at the app level).

**Done when**: e2e suite is green. 1 commit. **7 commits total for Phase 4.**

## Phase 5 — `apps/web-catalog`: public storefront

- [ ] 5.1 `apps/web-catalog/app/shared/config/stores/{index,default.config}.ts` — `StoreConfig` REWRITTEN (not imported) per D9: `slug, brand, locale, theme.colors, logo, hero, nav, productsPage, footer`. Unknown slug → `404` from the loader.
- [ ] 5.2 `apps/web-catalog/app/shared/lib/{public-api,tenant}.server.ts` — thin client to `api-public`, forwards `url.searchParams` verbatim; tenant resolution mirrors 4.2/4.4.

**Done when**: unknown-slug loader path returns 404 (own test, mirrors `api-public`'s D4 case per D9). 1 commit.

- [ ] 5.3 RED: `apps/web-catalog/app/catalog/**/*.test.tsx` — `/productos` URL params (`categoria`, `q`, `orden`, `pagina`, `porPagina`) forwarded verbatim; empty-result state; badge stack (Nuevo + `-10%` + `-$5.00` together) renders all three (spec: public-catalog).
- [ ] 5.4 GREEN: `/productos` route + `product-card`/`products-grid` components — design copied from `static-store/app/routes/products.tsx` (frozen, read-only reference, never imported); uses 0.4's `money.ts`.

**Done when**: 5.3 is green. 1 commit.

- [ ] 5.5 `/productos/:id` product-detail route — client-degrades gracefully on unknown id (mirrors `static-store/product-detail.tsx`'s design, D9's per-page reference); calls `GET /public/products/:id`.

**Done when**: unknown-id case renders a graceful empty state, not a crash. 1 commit. **4 commits total for Phase 5.**

## Phase 6 — `apps/web-catalog`: `/admin`

- [ ] 6.1 RED: `apps/web-catalog/app/shared/lib/session.test.ts` — cookie is `httpOnly`, `sameSite: 'lax'`, `domain: undefined` (D8, load-bearing); access token never appears in a loader payload; `isTokenExpired` local decode; refresh de-dupe `Map` (spec: catalog-admin "never exposes the token to the client").
- [ ] 6.2 GREEN: `apps/web-catalog/app/shared/lib/session.server.ts` — `SessionData = {accessToken, refreshToken, userId}`, no `activeCompanyId` (D8).

**Done when**: 6.1 is green. 1 commit.

- [ ] 6.3 `apps/web-catalog/app/shared/lib/api.server.ts` — `makeAuthenticatedRequest`: Bearer attach, retry once on 401 via refresh, destroy session on second 401.

**Done when**: manual/integration check against `api-idp` login round-trip. 1 commit.

- [ ] 6.4 `apps/web-catalog/app/shared/lib/auth.guards.server.ts` — `withAuth` ONLY (D7: no `withRoles`/`withPublicRedirect`/`withOptionalAuth` — not ported, no use case here). Login/logout routes as siblings of `layout('shared/routes/_auth.tsx', [...])` in `app/routes.ts`; wire `frozenStorefrontBoundaryRule` (1.7) into `web-catalog/eslint.config.mjs`.

**Done when**: `pnpm --filter web-catalog lint` passes at `--max-warnings 5` with the new rule active. 1 commit.

- [ ] 6.5 RED+GREEN: `/admin/productos[/nuevo|/:id/editar]` — create/edit/soft-delete; 403 render on cross-company mutation attempt (server re-verifies membership, D7); no store-switcher UI present (spec: catalog-admin, all product-CRUD + cross-company scenarios).

**Done when**: cross-company mutation test asserts rejection, never silent apply to either company. 1 commit.

- [ ] 6.6 RED+GREEN: `/admin/categorias[/nueva|/:id/editar]` — same CRUD/soft-delete/re-verification discipline as 6.5 (spec: catalog-admin "Admin updates a category", "Deletes are always soft").

**Done when**: category soft-delete leaves the row persisted with `active=false`. 1 commit.

- [ ] 6.7 Admin image-upload UI action — calls 3.2's endpoint via `makeAuthenticatedRequest` multipart, field `image`.

**Done when**: a successful upload updates the product's displayed image. 1 commit. **6 commits total for Phase 6.**

## Phase 7 — Final Verification

- [ ] 7.1 `pnpm turbo run lint typecheck test` across the whole monorepo — NestJS apps `--max-warnings 0`, `web-catalog` `--max-warnings 5`, zero regressions in any pre-existing suite.
- [ ] 7.2 Diff audit: `apps/static-store` changed ONLY at 1.8's one line; `packages/storefront` and `packages/api-common` untouched; `api-idp` gains no new transitive dependency.
- [ ] 7.3 Manual smoke: `default.localhost:3000/productos` lists the seeded tenant's products with search/filter/sort/pagination reflected in the URL; an unknown slug and an inactive company return the identical `404`.
- [ ] 7.4 Manual smoke: owner logs in at `/admin`, CRUDs a product/category, uploads an image that survives the 2.5 restart proof's mechanism.

**Done when**: all four pass with no follow-up commits needed. Not a commit itself (verification only) unless 7.1 surfaces a fix, in which case that fix is its own commit.
