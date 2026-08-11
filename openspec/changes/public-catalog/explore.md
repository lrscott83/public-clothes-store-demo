# Exploration: public-catalog (multi-tenant public product catalog)

> Phase artifact for SDD change `public-catalog`. Written by the orchestrator from
> engram topic `sdd/public-catalog/explore` (observation #2135) — the `sdd-explore`
> agent has no write tool, so the engram save is the primary record and this file is
> its openspec-parity copy.

## Verification table (claims 1-12)

Twelve findings from the pre-SDD investigation, re-checked against the code by an
independent pass instructed to refute rather than confirm. Nine held, three needed
correction.

| # | Verdict | Evidence |
|---|---|---|
| 1 | CONFIRMED | No `@Public()`/`APP_GUARD` anywhere in `templates/` (grep 0 hits). `ProductController` mounts `@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)` at class level (`templates/apps/api-salesops/src/product/product.controller.ts:52`). `JwtAuthGuard` rejects with 401 before `TenantContextGuard`'s ACTIVE-`Membership` check (`templates/packages/api-common/src/auth/tenant-context.guard.ts:90-111`) ever runs. Anonymous `GET /products` today = 401. |
| 2 | CONFIRMED, path correction | Actual path: `templates/packages/infra-db/prisma/master/schema.prisma`. `Company` (:95-112) has `slug String @unique` (:98), no `domain` column, no branding/theme columns in master or tenant schema. No migration needed for slug lookup. **Gap missed by the prior investigation**: `ICompanyRepository` (`packages/domain/src/company/company-repository.port.ts:14-23`) has NO `findBySlug` — only `list/findById/create/setSchemaName/delete`. Must be added (additive; `slug` is already `@unique`/indexed, so no migration). No public "resolve company by slug" HTTP endpoint exists either (`api-idp`'s `CompanyController` is `POST /companies` only, JWT-gated). |
| 3 | PARTIALLY TRUE | `Product.image` (tenant schema :92, domain `product.ts:28`) is a single required string — confirmed; no variants/size/colour model, no multer/s3/minio/sharp in any `package.json`. **BUT** the FROZEN `packages/storefront/src/catalog/types.ts:14` `StoreProduct` interface declares `images?: string[]` — dead and unused everywhere. Copying that UI type verbatim inherits a field that looks like multi-image support but is wired to nothing. |
| 4 | CONFIRMED | `finalPrice()`/`isOffer()` are pure functions in `packages/domain/src/product/pricing.ts:85-97`, never stored (`product.ts:10-13` states it explicitly). Percent (half-up rounded) then fixed `discountPrice` stack (pricing.ts:86-91), clamped at 0. `discountPrice` is a bare scaled bigint with no currency (pricing.ts:14-15). |
| 5 | PARTIALLY TRUE | `ProductResponseDto` (`product-response.dto.ts:11-30`) exposes `sku`/`barcode` as literal fields and does expose cost's currency — but bundled inside `cost: MoneyAmountDto {amount, currency}`, not as a separate top-level `costCurrency` scalar. The exclusion rule stands; the field name does not. |
| 6 | CONFIRMED | Controller (`product.controller.ts:78-86`) accepts only `includeInactive`/`categoryId`. `PrismaProductRepository.list()` (`infra-db/src/product/prisma-product.repository.ts:146-155`) filters on exactly those two and hardcodes `orderBy: { order: 'asc' }` — no search, no sort, no pagination (no skip/take). |
| 7 | CONFIRMED | `Product.order` (tenant schema :94) and `Category.order` (:69) are both required, non-nullable `Int`. |
| 8 | CONFIRMED | `assertCurrency` (`product.controller.ts:35-39`) checks `Set(['USD','EUR','MN'])` only; the domain comment (`product.ts:113`) confirms price/cost currency is caller-chosen and MAY differ. No single-currency-per-store constraint exists anywhere. |
| 9 | CONFIRMED, dormant today | `formatMoney` (`storefront/src/config/money.ts:12-24`) passes the currency straight to `Intl.NumberFormat` with zero validation. `MN` is a first-class domain `Currency` (`domain/src/currency/money.ts:4`) that passes backend `assertCurrency` but is not ISO 4217 → `RangeError`. Dormant because all three existing verticals use `currency: 'USD'`. It fires the moment any tenant prices in MN — plausible given the Cuba/Pinar-del-Río market context in `openspec/changes/appliances-storefront/exploration.md`. |
| 10 | CONFIRMED, exhaustive | Grepped `@store-mgmt/` across every ts/tsx/js/jsx/mjs/cjs/json in `apps/static-store`, `packages/web-common`, `apps/salesops-mvp`. static-store imports ONLY `@store-mgmt/storefront/*`, `@store-mgmt/web-common/styles.css` (CSS side-effect, not JS) and `@store-mgmt/eslint-config/*` — it declares `@store-mgmt/domain` at package.json:21 but imports zero symbols. `web-common`'s entire `src/` is six files with zero `@store-mgmt/domain` imports despite declaring it. `salesops-mvp` does not even list it as a dependency. **Changes to `packages/domain` cannot break any of the three.** |
| 11 | CONFIRMED exactly | `packages/infra-db/prisma/seed.js:98` provisions ONE tenant with `DEFAULT_COMPANY_SLUG='default'` / `DEFAULT_COMPANY_NAME='Tienda Prueba'` (`infra-db/src/company/seed.ts:16-17`). Catalog read from `apps/salesops-mvp/app/data/catalog.json` (seed.js:58-67) into master `TemplateCategory`/`TemplateProduct`, which `provisionCompany` COPIES into the tenant schema at provisioning time — a copy, not a live reference. |
| 12 | CONFIRMED | Only `api-common` (self), `api-salesops` and `api-idp` declare `@store-mgmt/api-common`; source-level imports appear only under those two apps (38 files). No legacy app touches it. |

## Terrain map

### poolops-biz `apps/web-manager`

`app/routes.ts` is one `RouteConfig` array: `layout('shared/routes/_auth.tsx', [...])`
wraps roughly fifty gated routes, and a short list of public routes
(`invitations/accept`, `health`, catch-all) sit as siblings outside it. That maps
directly onto "public catalog + `/admin` back office in one app".

`shared/routes/_auth.tsx` is a two-line re-export — `AuthLayout` as default,
`authLoader` as loader — because all the real logic lives in `@poolops/web-common`.
A feature folder is `routes/` + `components/` + an optional `lib/`.

Server pieces to REWRITE LOCALLY in `web-catalog/app/shared/lib/` (not re-extracted
as a package — one consumer today):

- `session.server.ts` — cookie session (`accessToken`, `refreshToken`, `userId`,
  `activeCompanyId`); `ensureValidSession` decodes the JWT expiry locally and
  refreshes on demand so parallel loaders don't stampede; `requireAuth`/`getUser`
  do 401 → refresh → retry once → else redirect, storing `return_to` in the session;
  a `Map`-based refresh de-dupe cache keyed by the old refresh token.
- `api.server.ts` — `makeAuthenticatedRequest`: attach Bearer, retry once on 401
  via refresh, destroy the session on a second 401.
- `auth.guards.server.ts` — `withAuth`/`withPublicRedirect`/`withOptionalAuth` HOC
  wrappers for loaders. `withPermissions`/`withRoles` are stubs there today.
- `route-loaders.server.ts` — thin named exports the route files import.
- `AuthLayout` — reads `{user}` from `useLoaderData`, renders `<Outlet context={{user}} />`.

### poolops-biz image pipeline (input for `packages/infra-storage`)

`storage.service.ts` writes to LOCAL DISK (not S3) under `STORAGE_PATH`. API:
`ensureDir`, `saveFile(dir, name, buffer)`, `getFullPath`, `fileExists`,
`generateUniqueFileName`.

`image-resizer.ts`'s `resizeForEmail` (sharp, 600px, JPEG q70) is used ONLY for
email embeds — **the general upload path does no resize or thumbnailing**. There is
no resize step to copy.

Upload: `FileInterceptor('photo')` + `ParseFilePipe([MaxFileSizeValidator(10MB),
FileTypeValidator(/^image\/(jpeg|png|webp|heic|heif)$/)])`. The service derives the
extension from the VALIDATED MIME type, never the client filename, writes to
`companies/{id}/locations/{id}/photos/{unique}`, stores the RELATIVE path in the DB,
and enforces a per-entity max-photos cap.

Serving: a separate authenticated `GET .../file` endpoint streams `{buffer, mimeType}`
with `Cache-Control: private, max-age=3600` — the wrong default for public product
images, which want a long public cache and a CDN in front.

### `api-salesops` wiring

`AppModule` is flat imports with no `APP_GUARD`. `AuthModule` is `@Global()`
specifically so `TenantContextGuard` — used via `@UseGuards` in nine-plus feature
modules that never import `AuthModule` — can resolve `MEMBERSHIP_REPOSITORY` and
`COMPANY_REPOSITORY`; both the guard AND those tokens must stay in `exports` (a
documented past bug exported only the guard).

`TenantContextService` is `AsyncLocalStorage`-backed: `run({companyId, schemaName}, fn)`
opens the scope, `getClient()` throws `TenantContextNotActiveError` if none is active
— no silent fallback. `createRunInTenant` exists as a per-controller helper because
the guard's ALS scope deliberately does NOT survive into the handler; every handler
re-opens its own scope.

**Critical for `api-public`:** `JwtAuthGuard`/`TenantContextGuard`/`RolesGuard` cannot
be reused. `TenantContextGuard` throws when `req.user` is absent and resolves the
Company through an ACTIVE `Membership(userId, companyId)` row that an anonymous
visitor does not have. Only `TenantContextService` and `TenantPrismaFactory` are
safely reusable. `api-public` needs a NEW, smaller guard: resolve Company by slug
(once `findBySlug` exists), check `isActive && schemaName !== null` the same way
(`tenant-context.guard.ts:113-119`), then call `tenantContext.run(...)` directly —
skipping JWT, Membership and Roles entirely.

### `static-store` UI to copy

`products.tsx` owns filter/sort/paginate state and delegates the math to the pure
`product-filters.ts` (`searchProducts`, `sortProducts`, `pageCount`, `paginate`,
`paginationRange` — a five-number windowed pager with ellipsis). `product-detail.tsx`
is client-only by design and degrades gracefully on an unknown id. `home.tsx` is a
Hero plus up to three conditional sections keyed to a `HOME_SECTIONS` map kept in
lockstep with the header nav.

Component discipline: never hardcode Tailwind colours (always theme tokens), always
`formatMoney` (never string concatenation).

`StoreConfig` shape: `vertical`, `brand{name,tagline,copyright}`, `locale`,
`currency`, `theme.colors{…}`, `logo{icon,tintToken,alt}`,
`hero{image,heading,subheading,ctaLabel,ctaPath}`, `nav[{label,path,kind}]`,
`homeSections{features,offers,newArrivals}`, `productsPage{~12 localized strings}`,
`features[{icon,title,description}]`, `footer{linkGroups,contact,copyright}`,
`catalog{categories,products}`. This is what the per-slug config in `web-catalog`
must reproduce.

### Testing conventions

- `api-salesops` — jest, co-located `*.spec.ts` under `src/` (ts-jest,
  `NODE_OPTIONS=--experimental-vm-modules`), a separate `test/*.e2e-spec.ts` suite
  with its own `jest-e2e.json` plus supertest, lint at `--max-warnings 0`.
- `static-store`/`storefront` — vitest, `*.test.{ts,tsx}`, jsdom, testing-library,
  `@vitest/coverage-v8`; static-store lints at `--max-warnings 5`.

New apps mirror these by type: NestJS → jest + e2e; React Router 7 SSR → vitest + jsdom.

## What the prior investigation missed

1. `ICompanyRepository`/`PrismaCompanyRepository` has no `findBySlug`. Additive, no
   migration, but it does not exist today.
2. `StoreProduct.images?: string[]` exists in the frozen storefront type and is
   entirely dead — a false signal for multi-image work.
3. The `JwtAuthGuard → TenantContextGuard → RolesGuard` chain is JWT-first by
   construction and cannot serve anonymous reads. This is bigger than "guards are
   per-controller, just don't mount them": `api-public` needs a genuinely new
   tenant-resolution guard.
4. There is zero CORS configuration in the backend (`enableCors` = 0 hits). Likely a
   non-issue if the browser never calls the API directly, but that is a decision, not
   an assumption.
5. No public "resolve company by slug" HTTP endpoint exists anywhere today.

## Open questions for the owner

1. Does `web-catalog`'s browser client ever call `api-public`/`api-salesops` directly,
   or exclusively via SSR loaders? Determines whether CORS work is in scope.
2. Will any tenant realistically price in `MN`? Determines the urgency of the
   `formatMoney` `RangeError`.
3. Should tenant resolution distinguish "inactive company" from "no such slug" the way
   `TenantContextGuard` does today, or should `api-public` flatten both to 404?
4. Reuse the local-disk storage convention 1:1 for product images, or move to object
   storage from day one, given these are public cacheable assets rather than private
   tenant documents?
