# Tasks: Products & Categories Module

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1300-1550 (domain ~520 incl. product+category+pricing+ports+tests, infra-db ~330 incl. schema+migration+2 repos+tests, api-salesops ~600 incl. 2 modules+DTOs+tests, cleanup −~140 dead lines; human-authored, excludes generated Prisma client/migration SQL and lockfile) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (structurally splittable into 5 units below) |
| Suggested split | Unit 1 (domain: Product+Category+pricing+ports) → Unit 2 (cleanup: delete dead `models/product.ts`) → Unit 3 (infra-db: schema+migration+2 repos+seed) → Unit 4 (api: ProductModule+CategoryModule) → Unit 5 (boundary+cross-runner verification) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

Delivery is `single-pr`: orchestrator must record `size:exception` before `sdd-apply` runs, since the estimate exceeds the 400-line budget. Work units below still apply as **commit** boundaries inside the single PR (work-unit-commits skill), each independently revertible.

### Suggested Work Units

| Unit | Goal | Scope (single PR, commit-level) | Depends on |
|------|------|-----------|-----------|
| 1 | Domain: Product + Category entities, pure `pricing.ts`, ports, errors | Phases 0-2 | none |
| 2 | Cleanup: delete dead `models/product.ts` + barrel line | Phase 3 | Unit 1 (new `product/` namespace exists so no name collision) |
| 3 | infra-db: Prisma schema, migration, 2 repositories, seed | Phase 4 | Unit 1 (port types) |
| 4 | api-salesops: `ProductModule` + `CategoryModule` | Phase 5 | Unit 3 (repositories) |
| 5 | Boundary + full three-runner verification + commission-seam doc | Phase 6 | Units 1-4 |

## Phase 0: Boundary & Tooling Foundation

- [x] 0.1 Confirm `templates/packages/infra-db/package.json` already depends on `@store-mgmt/domain: workspace:*` (added in the currency change) — no new dependency needed for `infra-db → domain`.
- [x] 0.2 Confirm `apps/api-salesops/package.json` already depends on `@store-mgmt/domain: workspace:*` (added in the currency change, task 4.1) — reuse for `ProductModule`/`CategoryModule` DTOs and domain imports.
- [x] 0.3 No new lint/jest config needed — `infra-db` and `api-salesops` already carry `NODE_OPTIONS=--experimental-vm-modules` (Prisma 7 WASM) and jest config from the currency change; `domain` already runs vitest.

## Phase 1: Domain — Product entity + pricing (vitest, `pnpm --filter @store-mgmt/domain test`)

- [x] 1.1 [RED] `domain/src/product/errors.ts` is referenced by tests before it exists: `product.test.ts` imports `InvalidProductError`, `CategoryError` types are asserted via `toThrow(InvalidProductError)`. Write `domain/src/product/product.test.ts` covering `createProduct`: rejects `price.minorUnits <= 0`; rejects `percentDiscountPrice` outside `[0, 100_00]` (scale-2 bounds); rejects `discountPrice.minorUnits < 0`; rejects non-USD Money on `price`/`discountPrice`/`costoUSD`; accepts valid input and defaults `percentDiscountPrice`/`discountPrice` to `0` when omitted.
- [x] 1.2 [GREEN] `domain/src/product/errors.ts`: `InvalidProductError` (named, throws with a descriptive message — no silent guess). `domain/src/product/product.ts`: `interface Product` per design (`id, name, description, sku?, barcode?, price: Money, percentDiscountPrice: bigint, discountPrice: Money, costoUSD: Money, categoryId: string, image: string, isNew: boolean, order: number, active: boolean, createdAt: Date, updatedAt: Date`) + `createProduct(input)` factory enforcing the invariants from 1.1. Run the suite to confirm 1.1 is GREEN.
- [x] 1.3 [RED] `domain/src/product/pricing.ts` does not exist yet: write `domain/src/product/pricing.test.ts` covering `finalPrice`: percent+fixed discount stack (`price=100, pct=20, discountPrice=5 → 75`); 100% discount is free (`price=50, pct=100 → 0`); over-discount clamps at zero, never negative (`price=10, pct=50, discountPrice=20 → 0`); no-discount defaults to base price (`finalPrice == price`); single HALF-UP rounding drift test (fractional intermediate, same discipline as the Currency conversion drift test) — asserts exactly ONE division occurs. Also cover `isOffer`: `true` when `percentDiscountPrice > 0 || discountPrice > 0`, `false` otherwise.
- [x] 1.4 [GREEN] `domain/src/product/pricing.ts`: `PERCENT_SCALE = 2` const, `percentFromDecimalString`/`percentToDecimalString` helpers (mirror `rateFromDecimalString`/`rateToDecimalString`), pure `finalPrice(product: Product): Money` and `isOffer(product: Product): boolean` implementing the exact computation from `design.md` (`discountFromPercent = divRoundHalfUp(price.minorUnits * pct, 10_000n)`; `finalCents = price.minorUnits - discountFromPercent - discountPrice.minorUnits`; clamp at `0n`), reusing `divRoundHalfUp` and `money` from the domain currency barrel. Run the suite to confirm 1.3 is GREEN.
- [x] 1.5 [RED] `domain/src/product/pricing.test.ts` (same file, additional cases): `percentFromDecimalString`/`percentToDecimalString` round-trip fidelity for fractional percents (e.g. `"12.50"` ↔ `1250n`), mirroring the Money/rate decimal-string round-trip tests.
- [x] 1.6 [GREEN] Fill in/adjust `percentFromDecimalString`/`percentToDecimalString` in `pricing.ts` to pass 1.5 if not already covered by 1.4.

## Phase 2: Domain — Category entity + ports (vitest)

- [x] 2.1 [RED] `domain/src/product/category.test.ts`: `createCategory` rejects empty/whitespace-only `slug`; accepts valid `name`+`slug`; produced `Category` has no `parentId` field (FLAT — type-level check via `Object.keys` or a compile-time `expectTypeOf`-style assertion, matching the spec's "no hierarchy field" scenario).
- [x] 2.2 [GREEN] `domain/src/product/category.ts`: `interface Category { id: string; name: string; slug: string; image?: string; icon?: string; order: number; active: boolean; createdAt: Date; updatedAt: Date }` + `InvalidCategoryError` in `errors.ts` + `createCategory(input)` factory enforcing non-empty `slug`. Run the suite to confirm 2.1 is GREEN.
- [x] 2.3 `domain/src/product/product-repository.port.ts` (type-only, no I/O): `interface IProductRepository { create(input): Promise<Product>; update(id, patch): Promise<Product>; softDelete(id): Promise<void>; findById(id): Promise<Product | null>; list(filter?): Promise<Product[]> }` + `const PRODUCT_REPOSITORY = Symbol('IProductRepository')`.
- [x] 2.4 `domain/src/product/category-repository.port.ts` (type-only, no I/O): `interface ICategoryRepository { create(input): Promise<Category>; update(id, patch): Promise<Category>; softDelete(id): Promise<void>; findById(id): Promise<Category | null>; findBySlug(slug): Promise<Category | null>; list(filter?): Promise<Category[]> }` + `const CATEGORY_REPOSITORY = Symbol('ICategoryRepository')`. Both ports verified via infra-db's `implements` clause in Phase 4 (same pattern as `ICurrencyRepository`).
- [x] 2.5 `domain/src/product/index.ts` barrel: re-export `product.ts`, `category.ts`, `pricing.ts`, `product-repository.port.ts`, `category-repository.port.ts`, `errors.ts`. Add `export * from './product/index.js';` to `domain/src/index.ts` (after the existing `currency` line, matching import order).
- [x] 2.6 Run `pnpm --filter @store-mgmt/domain test` full-green (all product+category+pricing tests plus existing currency suite untouched).

## Phase 3: Cleanup — remove dead legacy `models/product.ts`

- [x] 3.1 Confirm via `rg "models/product"` that `templates/packages/domain/src/index.ts` line 4 (`export * from './models/product.js';`) is the ONLY reference to the dead file, no real consumers import from it directly.
- [x] 3.2 Delete `templates/packages/domain/src/models/product.ts` (legacy `Product extends AuditableBaseModel` + `ProductCategory`, old poolops multi-tenant shape — dead, superseded by `product/product.ts`).
- [x] 3.3 Remove the `export * from './models/product.js';` line from `templates/packages/domain/src/index.ts`.
- [x] 3.4 Run `pnpm --filter @store-mgmt/domain typecheck` and `pnpm --filter @store-mgmt/domain lint` (`backend-boundaries --max-warnings 0`) to confirm the removal is green — no hidden import broke.

## Phase 4: infra-db — Prisma adapter (jest + real Postgres, `pnpm --filter @store-mgmt/infra-db test`)

- [x] 4.1 Append `model Category` + `model Product` (exact shape from `design.md`: `Product.price`/`discountPrice`/`costoUsd` as `Decimal(18,2)`, `percentDiscountPrice` as `Decimal(5,2)` default 0, `categoryId` FK `@db.Uuid` with `@@index`, UUID `@db.Uuid` PKs, `slug @unique` on Category, `created_at`/`updated_at` audit on both, `active` soft-delete on both) to `templates/packages/infra-db/prisma/schema.prisma`, appended after the existing Currency models — additive-only.
- [x] 4.2 Generate migration `add_products_module` (`pnpm --filter @store-mgmt/infra-db prisma:migrate`); confirm additive-only (pure `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ... ADD CONSTRAINT` for the FK, no `ALTER`/`DROP` touching `exchange_rate` or other existing tables); confirm `/health` (`PrismaService.$queryRaw`SELECT 1``) untouched.
- [x] 4.3 [RED] `infra-db/src/product/prisma-category.repository.spec.ts`: `create()` persists a `Category` with a real DB-generated UUID `id`; duplicate `slug` on `create()` rejects (unique constraint surfaces as an error, not silent overwrite); `findBySlug()` round-trips; `softDelete()` flips `active=false` without deleting the row. Confirm RED first (missing production module error) before implementing.
- [x] 4.4 [GREEN] `infra-db/src/product/prisma-category.repository.ts`: `@Injectable() class PrismaCategoryRepository implements ICategoryRepository`, injects `PrismaService`, to pass 4.3. All tests green against the real `store_mgmt` Postgres DB.
- [x] 4.5 [RED] `infra-db/src/product/prisma-product.repository.spec.ts`: `create()` persists a `Product` linked to a valid `categoryId` with Decimal↔Money round-trip fidelity on `price`/`discountPrice`/`costoUSD` and scaled-bigint↔Decimal round-trip on `percentDiscountPrice`; `findById()` returns the full shape; `softDelete()` flips `active=false`, row still `findById`-able (never hard-deleted, matches the "historical references" spec scenario); `list()` excludes `active=false` products by default.
- [x] 4.6 [GREEN] `infra-db/src/product/prisma-product.repository.ts`: `@Injectable() class PrismaProductRepository implements IProductRepository`, injects `PrismaService`, maps Prisma `Decimal` (string) ↔ domain `Money` via `moneyFromDecimalString`/`moneyToDecimalString` and `percentDiscountPrice` Decimal ↔ scaled `bigint` via `percentFromDecimalString`/`percentToDecimalString`, to pass 4.5. All tests green against the real Postgres DB.
- [x] 4.7 Export `PrismaProductRepository` + `PrismaCategoryRepository` from `infra-db/src/index.ts` (mirror the `PrismaCurrencyRepository` export line).
- [x] 4.8 `infra-db/prisma/seed` script: load `apps/salesops-mvp/app/data/catalog.json`, insert exactly the 11 slugs (`cafeteras, climatizacion, cocinas, energia-solar, freidoras, lavadoras, licuadoras, ollas, refrigeracion, tv-y-audio, utiles`) as `Category` rows with `name` humanized from `slug`, all `active=true`; insert each catalog product as a `Product` row linked by `categoryId` to its matching seeded category, with `costoUsd = price * 0.6` as a documented synthetic placeholder (comment flags it as non-real, pending open input #4).
- [x] 4.9 [RED] `infra-db/src/product/prisma-category.repository.spec.ts` (seed-adjacent case, or a dedicated seed spec): running the seed against a fresh DB produces exactly 11 active `Category` rows, one per catalog slug; every seeded `Product.categoryId` resolves to one of the 11 (never a dangling reference) — this directly covers the spec's "Seed produces 11 active categories" and "Seeded products reference a valid category" scenarios.
- [x] 4.10 [GREEN] Adjust the seed script if 4.9 fails; run `pnpm --filter @store-mgmt/infra-db test` full-green (existing currency tests + new product/category tests). Also run `lint` (`--max-warnings 0`) and `typecheck`/`build` green.

> **Owner revision (mid-apply, 4.8-4.9)**: seed changed from "insert" to a SINGLE idempotent upsert entrypoint (`src/product/seed.ts`, wired via `prisma.config.ts` `migrations.seed` -> `prisma/seed.js`). Category upserts on its unique `slug`; Product upserts on a deterministic UUID v5 derived from the catalog.json product id (no other natural unique key exists — `sku` is nullable). Re-running never duplicates rows; `seed.spec.ts` proves this by running the seed twice and asserting identical row counts + identical product ids. Verified end-to-end against the shared DB (`node prisma/seed.js` twice -> 11 categories / 99 products, not 22/198), then cleaned up before running the automated suite.

## Phase 5: api-salesops — ProductModule + CategoryModule (jest, `pnpm --filter @store-mgmt/api-salesops test`)

- [x] 5.1 `apps/api-salesops/src/category/dto/*.ts`: `create-category.dto.ts`, `update-category.dto.ts`, `category-response.dto.ts`, `dto/index.ts` — every field plain (no money fields on Category); response DTO shape matches `design.md`'s CRUD contract.
- [x] 5.2 [RED] `category.service.spec.ts`: with mocked `CATEGORY_REPOSITORY`, service creates/updates/soft-deletes/lists/finds-by-slug and maps to response DTOs; rejects duplicate-slug creation by surfacing the repository's typed error, never swallowed.
- [x] 5.3 [GREEN] `apps/api-salesops/src/category/category.service.ts`: inject `CATEGORY_REPOSITORY`, implement CRUD orchestration, to pass 5.2.
- [x] 5.4 [RED] `category.controller.spec.ts`: `POST /categories` → 201; `GET /categories` → list (active-only by default); `GET /categories/:id` → 200/404; `PATCH /categories/:id` → 200; `DELETE /categories/:id` → soft-delete 200/204, not a hard delete; malformed slug/name → 400.
- [x] 5.5 [GREEN] `apps/api-salesops/src/category/category.controller.ts` to pass 5.4, mapping `InvalidCategoryError` → 400.
- [x] 5.6 `apps/api-salesops/src/category/category.module.ts`: `imports: [InfraDbModule]`; providers `CategoryService`, `{ provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository }`; declares `CategoryController`. Mirror `currency.module.ts`.
- [x] 5.7 `apps/api-salesops/src/product/dto/*.ts`: `create-product.dto.ts`, `update-product.dto.ts`, `product-response.dto.ts`, `dto/index.ts` — every money/percent field typed `string` (mirror `create-rate.dto.ts`); response DTO includes `price`, `discountPrice`, `costoUSD`, `percentDiscountPrice` as strings PLUS derived `finalPrice: string` and `isOffer: boolean`.
- [x] 5.8 [RED] `product.service.spec.ts`: with mocked `PRODUCT_REPOSITORY`, service maps resolved domain `Money`/percent `bigint` to decimal strings on create/update/get/list; calls domain `finalPrice`/`isOffer` and includes them in every read response; rejects creation with a missing/nonexistent `categoryId` by surfacing a typed error (never a silent 500), matching the spec's "Product rejected without category" scenario; `softDelete` flips `active` without exposing a hard-delete path.
- [x] 5.9 [GREEN] `apps/api-salesops/src/product/product.service.ts`: inject `PRODUCT_REPOSITORY`, call domain `createProduct`/`finalPrice`/`isOffer`, map `Money`↔string and percent↔string, to pass 5.8.
- [x] 5.10 [RED] `product.controller.spec.ts`: `POST /products` → 201 with string fields + derived `finalPrice`/`isOffer`; `GET /products` → active-only list by default, each item carries derived fields; `GET /products/:id` → 200 (including soft-deleted, for historical references) / 404 for unknown id; `PATCH /products/:id` → 200; `DELETE /products/:id` → soft-delete, excluded from default listing afterward; malformed price/percent/discount or missing `categoryId` → 400.
- [x] 5.11 [GREEN] `apps/api-salesops/src/product/product.controller.ts` to pass 5.10, mapping `InvalidProductError` → 400, "category not found" → 400/404 per the repository's error contract.
- [x] 5.12 `apps/api-salesops/src/product/product.module.ts`: `imports: [InfraDbModule]`; providers `ProductService`, `{ provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository }`; declares `ProductController`. Mirror `currency.module.ts`.
- [x] 5.13 Wire `ProductModule` + `CategoryModule` into `apps/api-salesops/src/app.module.ts` imports, alongside the existing `CurrencyModule`.
- [x] 5.14 Run `pnpm --filter @store-mgmt/api-salesops test` full-green (existing currency suite + new product/category suites). Confirm `typecheck`/`build` exit 0.

## Phase 6: Cross-cutting Verification & Commission Seam

- [ ] 6.1 `pnpm --filter @store-mgmt/domain lint && pnpm --filter @store-mgmt/infra-db lint && pnpm --filter @store-mgmt/api-salesops lint` — `backend-boundaries --max-warnings 0` stays green; domain still imports nothing from infra/api; `domain → infra` edge remains forbidden.
- [ ] 6.2 Run all three suites together (domain vitest, infra-db jest w/ real Postgres, api-salesops jest); confirm every scenario in `openspec/changes/backend-products/specs/salesops-products/spec.md` is covered by at least one test (Product creation w/ required fields, Product rejected without category, Category has no hierarchy, duplicate slug rejected, percent+fixed discount stack, 100% discount free, over-discount clamps at zero, no-discount defaults, pricing never uses float, mono-currency deploy valid, deactivated category keeps products intact, deactivated product excluded from default listing, Product schema has no commission field, seed produces 11 categories, seeded products reference valid category).
- [ ] 6.3 Add `templates/packages/domain/src/product/commission-seam.md` (or a top-of-file comment block in `product.ts`) documenting the FUTURE `ICommissionReferenceProvider` interface exactly as specified in `design.md`'s "Commission seam (Option B)" section — type/doc only, NOT implemented, NOT exported from the barrel. Verify `Product` has zero commission-related fields (`rg -i "commission|comisionMN"` in `product/` returns only this doc reference).
- [ ] 6.4 Confirm `typecheck`/`build` green for all three packages together (domain rebuilt first so consumers see the new `product/` barrel exports).
- [ ] 6.5 Update `design.md`'s reviewer checklist / open questions section: check off "Confirm `percentDiscountPrice` allows decimals" and "Confirm `Decimal(18,2)` precision is sufficient" once evidence is gathered from the implemented tests; leave "Real supplier-cost source for `costoUsd`" open (explicitly out of scope, synthetic placeholder documented in 4.8).

## Out of Scope (unchanged from design.md)

Variants, pricelists, uom, barcode-scanning POS · commission fields on Product (seam only, Phase 6.3) · category hierarchy/`parentId` · buy/sell spread, wallet/balances (Currency module concerns, untouched) · real supplier-cost source for `costoUsd` (open input #4) · Gestores/Comisiones module implementation.
