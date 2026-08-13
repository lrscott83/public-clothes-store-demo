# Proposal: Public Product Catalog (multi-tenant)

## Intent

The backend already owns products, categories, pricing and tenants, but **no
shopper can see a catalog**. The only browsable storefront is `apps/static-store`,
which is FROZEN, single-vertical and reads a JSON file — not the database. Store
owners equally have no way to maintain their own catalog: today it takes a
developer. This change ships the missing pair — a public read API and a public web
catalog with a `/admin` back office — so one deployment serves every tenant and an
owner maintains their own products.

## Scope

### In Scope

- **`templates/apps/api-public`** (NestJS) — read-only public API over
  `@store-mgmt/domain` + `@store-mgmt/infra-db`. Does NOT proxy `api-salesops`.
- **`templates/apps/web-catalog`** (React Router 7 SSR) — public catalog + `/admin`,
  structured as `app/<feature>/{routes,components,lib}` per `web-manager`.
- **`templates/packages/infra-storage`** (NEW package) — filesystem storage adapter
  behind a domain port. Consumed ONLY by `api-salesops` (writes) and `api-public`
  (reads).
- **Tenant by subdomain**: first label → `Company.slug` (already `@unique`). One
  deployment, all tenants. Local: `default.localhost:3000`. **No DB migration**, but
  it does require **adding `findBySlug` to `ICompanyRepository`**
  (`packages/domain/src/company/company-repository.port.ts:14-23` has only
  `list/findById/create/setSchemaName/delete`) and implementing it in
  `PrismaCompanyRepository`. Cross-package, additive.
- **A NEW, smaller tenant guard inside `api-public`** — not a reuse of the existing
  chain. It resolves Company by slug, checks `isActive && schemaName !== null` the
  way `tenant-context.guard.ts:113-119` does, then calls `tenantContext.run(...)`
  directly, skipping JWT, Membership and Roles entirely.
- **Unknown slug and inactive company both return a flat `404`** — never
  distinguished. On an unauthenticated endpoint, telling them apart discloses which
  stores exist and which are down.
- **Products view**: design copied from `static-store/app/routes/products.tsx` +
  `product-card.tsx` — search, category, sort, 12/24/48 page size, counter,
  ellipsis paginator. Search/sort/pagination are **server-side**; filter state
  lives in the URL (`/productos?categoria=&q=&orden=&pagina=`).
- **Sort**: featured (`Product.order` asc, default), price asc/desc, name A-Z.
  "Price" = `finalPrice`, computed by `packages/domain/src/product/pricing.ts`
  and sorted **before** paginating. Search = `ILIKE` on name + description.
- **Public DTO** owned by `api-public`: never `cost` (a `MoneyAmountDto`, so its
  `currency` goes with it — there is no top-level `costCurrency` scalar), never
  `sku`, never `barcode`. Never sends `includeInactive`.
- **Badges**: green "Nuevo" (`isNew`), red `-10%` (`percentDiscountPrice`), red
  `-$5.00` (`discountPrice`, with the price's currency) — both stack.
- **Branding per slug**: config file inside `web-catalog`, shaped like
  `static-store/verticals/appliances/store.config.ts`.
- **Admin** at `/admin` on the same subdomain, protected routes under
  `layout('shared/routes/_auth.tsx', […])`. Login via `api-idp`; access token in
  an `httpOnly` server cookie. Full CRUD for products **and** categories; deletes
  are always SOFT. No store switcher — the subdomain fixes the store and
  `TenantContextGuard` re-verifies membership. Routes: `/admin`,
  `/admin/productos[/nuevo|/:id/editar]`, `/admin/categorias[/nueva|/:id/editar]`.
- **Images**: upload added to `api-salesops` (owner/admin only).
  - *Copied from poolops-biz* (proven): `FileInterceptor` + `ParseFilePipe`
    (`MaxFileSizeValidator` 10MB, `FileTypeValidator` allowing jpeg/png/webp/heic/
    heif), extension derived from the **validated MIME type, never the client
    filename**, and a **relative** path stored in the DB.
  - *New work, NOT a copy*: image normalisation with `sharp` (EXIF rotate, resize,
    re-encode). poolops-biz's `resizeForEmail` is used only for email embeds — its
    general upload path does no resize or thumbnailing, so there is nothing to lift.
  - Storage on local disk with a **mounted volume**, tenant-scoped
    `storage/<companyId>/products/…`, UUID immutable filenames. Public GET served by
    `api-public` **unauthenticated** but tenant-checked and active-checked,
    `Cache-Control: max-age=31536000, immutable`.
- Session/auth/API-client layer inside `web-catalog/app/shared/lib/` (one consumer
  today; extract to `packages/web-common` when a second appears).

### Out of Scope

- Cart, checkout, sales, delivery, prices-with-tax — browse only.
- Custom per-store apex domains (needs a `domain` column + resolver branch).
- A `StoreSettings` table — branding stays in files.
- Full-text search; currency conversion in sorting; multi-currency normalization.
- Cloud object storage / CDN (the URL shape is chosen so a CDN can be added later).
- **CORS.** The browser never calls `api-public` or `api-salesops` directly — every
  call goes through `web-catalog`'s SSR loaders (server-to-server), and `<img>` tags
  are not subject to CORS. Stated explicitly so this is not rediscovered later as a
  gap; the backend has zero `enableCors` today and needs none.
- **Multi-image products.** `StoreProduct.images?: string[]`
  (`packages/storefront/src/catalog/types.ts:14`) is dead code — declared, wired to
  nothing. `web-catalog` MUST NOT copy it; it is a false signal of multi-image
  support. `Product.image` stays a single `String`.
- Seeding a clothes tenant — dev uses the seeded `default` / "Tienda Prueba"
  (appliances dataset). Data work, separate change.
- Any edit to `apps/static-store`, `packages/storefront`, the appliances vertical.

## Capabilities

### New Capabilities

- `public-catalog`: anonymous, tenant-scoped read API + SSR storefront — subdomain
  tenant resolution, server-side search/sort/pagination on derived `finalPrice`,
  a public DTO that hides internal business data, and authenticated-free image GET
  that still hides inactive products.
- `catalog-admin`: owner/admin maintenance of products and categories from the
  store's own subdomain — `httpOnly` cookie session against `api-idp`, soft deletes,
  no store switcher.

### Modified Capabilities

- `salesops-tenancy`: adds an **unauthenticated** tenant-resolution path (subdomain
  label → `Company.slug`) for public read endpoints, served by a NEW guard, alongside
  today's `X-Company-Id`/membership chain — which stays untouched.
- `salesops-companies`: adds `findBySlug` to `ICompanyRepository` and its Prisma
  implementation. Additive port surface, no migration.
- `salesops-products`: adds an authenticated product-image upload endpoint
  (owner/admin) that validates, normalizes and stores the file and sets
  `Product.image`.

## Approach & Key Decisions

| Decision | Rationale (verified) |
|---|---|
| One deployment, tenant per request | `api-common/src/auth/tenant-context.guard.ts` documents that the schema-currency gate was moved OUT of `main.ts` boot precisely because a boot gate let one bad tenant refuse boot for all. The stack is built for one process / many tenants. |
| Tenant = subdomain label → `Company.slug` | `slug String @unique` already exists in `templates/packages/infra-db/prisma/master/schema.prisma:98`. Zero migration — but `findBySlug` does not exist on the port yet and must be added. |
| A NEW guard, not the existing chain | `TenantContextGuard` throws when `req.user` is absent and resolves the Company through an ACTIVE `Membership(userId, companyId)` row an anonymous visitor does not have. Only `TenantContextService` and `TenantPrismaFactory` (`packages/infra-db/src/tenant/`) are safely reusable. |
| Unknown slug and inactive company are both `404` | Distinguishing them on an unauthenticated endpoint discloses which stores exist and which are down. |
| Storage adapter in a NEW `packages/infra-storage`, not `api-common` | `docs/system/architecture.md`'s decision table puts external/infrastructure adapters in `packages/infra-<x>/` (the repo already has `infra-db`); `api-common` is auth + NestJS utilities. Practical driver: `api-idp` also consumes `api-common` and would inherit `sharp`, a ~30MB native binary it never uses. |
| Public tenant resolver lives inside `api-public` | One consumer, and it is an *unauthenticated* path that must stay out of the apps that require a token. |
| `api-public` hits the DB directly | Proxying `api-salesops` would inherit its authenticated, `cost`-exposing DTO. |
| Sort by `finalPrice` in the app, not SQL | `finalPrice` is DERIVED, never stored. `packages/domain` is the single source of truth; duplicating the formula in SQL would fork it. |
| `web-catalog` gets its own money formatter | `Currency` includes `'MN'` (`domain/src/currency/money.ts:4`), which is not ISO 4217. `packages/storefront/src/config/money.ts` calls `Intl.NumberFormat({style:'currency'})` with no guard — copying it verbatim throws `RangeError: Invalid currency code : MN`. |
| Public image GET through `api-public`, not nginx | nginx would happily serve the photo of a deactivated product. "Public hides inactive" must live in exactly one place. |
| Branding in files, not DB | `Company` has no branding columns; a `StoreSettings` table is deferred. |

## Constraints (non-negotiable)

- `apps/static-store`, `packages/storefront` and the appliances vertical are
  **FROZEN**: read for design, **never import, never edit**. Copy the design by
  writing new code in `web-catalog`.
- **Legacy-safe package modification — the standing rule.** Before modifying any
  shared package:
  1. **Grep whether a frozen/legacy file actually imports the symbol.** A declared
     dependency in `package.json` does NOT count — only a real import does.
  2. **Not imported → modify normally.**
  3. **Imported → copy that symbol into a new package**, point the new code at the
     copy, leave the original untouched.
  This rule does **not** bite for `@store-mgmt/domain` here: exploration grepped
  every ts/tsx/js/jsx/mjs/cjs/json in `static-store`, `web-common` and `salesops-mvp`
  and found **zero** imported symbols from `@store-mgmt/domain` (both `static-store`
  and `web-common` merely *declare* the dependency). So `api-public` imports
  `finalPrice`/`Money` from the domain directly — **no duplication**.
  An **ESLint rule should enforce this instead of memory**; the repo already
  enforces boundaries that way (`static-store/eslint.config.mjs` imports
  `backend-boundaries` from `packages/eslint-config`).
- `packages/domain` is the single source of truth for money and pricing maths —
  no duplication of `pricing.ts` in SQL or in the browser.
- **Upload file extensions derive from the validated MIME type, never from the
  client-supplied filename.** This is a security property, not a detail.
- Any change to `packages/domain`, `packages/infra-db` or `apps/api-salesops`
  is a **cross-package impact** and must be called out explicitly in specs/design,
  never slipped in.
- Strict TDD. Branch `public-catalog` off `main`, commits only, **no PRs**.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `templates/apps/api-public` | New | Public read API, public DTO, image GET, **its own** slug tenant guard |
| `templates/apps/web-catalog` | New | SSR catalog, `/admin` CRUD, per-slug branding configs |
| `templates/packages/infra-storage` | **New package** | Filesystem storage adapter + image normalisation (`sharp`). Consumed only by `api-salesops` and `api-public` |
| `templates/apps/api-salesops` | Modified | +image upload endpoint (owner/admin) |
| `templates/packages/domain` | **Modified (additive)** | +`findBySlug` on `ICompanyRepository`; +storage port. Pricing/money untouched |
| `templates/packages/infra-db` | **Modified (additive)** | +`findBySlug` in `PrismaCompanyRepository`. Reuses `TenantContextService`/`TenantPrismaFactory` as-is. **No migration** |
| `templates/packages/api-common` | **Unchanged** | Deliberately dropped from scope — storage went to `infra-storage`, the resolver into `api-public`, and the reusable tenant primitives live in `infra-db` |
| deployment / compose | Modified | Mounted volume for `STORAGE_PATH` |
| `apps/static-store`, `packages/storefront` | FROZEN | Design reference only |

## Open Points (deliberately unresolved)

- **Mixed currencies inside one store.** `assertCurrency`
  (`api-salesops/src/product/product.controller.ts:35-39`) only checks membership
  in the currency set — it does not force one currency per store. Price sorting
  compares raw numeric `finalPrice` values **without conversion**. The owner
  deferred this explicitly. Record it; do NOT design around it and do NOT assume a
  single currency per store.
- **Public image cache/serving strategy.** poolops-biz serves photos from an
  *authenticated* endpoint with `Cache-Control: private, max-age=3600` — the wrong
  default for public product images. Our target (`public`, one-year immutable) is
  stated above; the exact serving mechanics are a design-phase decision.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Price sort is wrong when a store mixes currencies | Med | Accepted/deferred by the owner. Documented in specs as a known limitation, not a bug to design around |
| `MN` crashes `Intl.NumberFormat` and blanks the page | High | `web-catalog` owns its formatter with an explicit `MN` branch; a test asserts `MN` formats instead of throwing. Never copy the storefront formatter |
| Images lost on container recreation | High | Mounted volume for `STORAGE_PATH` is part of the deliverable, not an ops afterthought; UUID immutable filenames |
| Loading all filtered rows into memory to sort by `finalPrice` | Med | Bounded by one tenant's catalog; measure at realistic size. DB-side precompute deferred, not silently ruled out |
| Public DTO leaks `cost`/`sku`/`barcode` by drifting toward `api-salesops`' DTO | Med | `api-public` owns a separate DTO; a contract test asserts those fields are absent |
| **The anonymous tenant guard is NEW code, not configuration** — sizing risk | Med | The existing chain is JWT-first by construction and cannot be mounted-around. Budget it as a real unit with its own tests; reuse is limited to `TenantContextService`/`TenantPrismaFactory` |
| **Image normalisation is NEW work** — poolops-biz's upload path has no resize to copy | Med | Only the validation/interceptor/relative-path parts are a copy; `sharp` usage is written and tested from scratch. Do not plan it as a lift-and-shift |
| Cross-package edits (`domain`, `infra-db`, `api-salesops`) break existing consumers | Low | Additive only; exploration verified no legacy app imports a single symbol from `@store-mgmt/domain`; existing suites must stay green |
| Unauthenticated tenant resolution widens the tenancy surface | Med | Public path is read-only + active-only; unknown slug and inactive company are indistinguishable `404`s; delta spec to `salesops-tenancy` states it explicitly |

## Rollback Plan

Three new directories — `templates/apps/api-public`, `templates/apps/web-catalog`,
`templates/packages/infra-storage` — delete them and drop their workspace/turbo
entries; nothing pre-existing depends on them. The shared edits are all **additive
and revert independently**: `findBySlug` on the company port + its Prisma
implementation (unused once `api-public` is gone) and the `api-salesops` upload
endpoint. `packages/api-common` is untouched, so `api-idp` cannot be affected at all.
**No DB migration**, so there is nothing to undo in Postgres; uploaded files under
`STORAGE_PATH` become orphaned data, not corrupted state.

## Dependencies

- `api-idp` reachable for admin login; seeded `default` / "Tienda Prueba" tenant.
- New deps: `sharp` in `packages/infra-storage` (deliberately NOT in `api-common`,
  which `api-idp` consumes); `@nestjs/platform-express` (multer) in `api-salesops`.
- `STORAGE_PATH` env + a mounted volume in the runtime environment.
- Wildcard subdomain routing locally (`*.localhost`) and in deployment.

## Success Criteria

- [ ] `default.localhost:3000/productos` lists the seeded tenant's active products
      with search, category filter, sort, pagination — all reflected in the URL.
- [ ] A second slug on the same deployment renders its own catalog and branding.
- [ ] An unknown slug and an inactive company return the SAME `404` — the response
      does not reveal which case it was.
- [ ] Sorting by price orders by `finalPrice` imported from `packages/domain`
      (no copy, no SQL reimplementation).
- [ ] A product priced in `MN` renders its price without throwing.
- [ ] Public responses contain no `cost` (amount or currency), no `sku`, no
      `barcode`, and no inactive/soft-deleted product.
- [ ] An `owner`/`admin` logs in at `/admin`, creates/edits/soft-deletes products
      and categories, and uploads a product image that survives a container restart.
- [ ] The access token never reaches the browser (`httpOnly` cookie only).
- [ ] `apps/static-store`, `packages/storefront` and `packages/api-common` are
      untouched in the diff; `api-idp` gains no new transitive dependency.
