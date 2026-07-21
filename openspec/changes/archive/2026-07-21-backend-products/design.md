# Design — Products & Categories Module

Second real domain vertical slice on the hexagonal backend base scaffold, mirroring
the shipped Currency slice end-to-end. Two master-data entities — `Product` and
`Category` — with decimal-safe USD `Money` reusing the Currency VO, a DERIVED
`finalPrice` computed by a pure pricing function (never stored), persistence behind
`IProductRepository` / `ICategoryRepository` ports, and thin `ProductModule` /
`CategoryModule` CRUD delivery. This DECIDES the implementation-level questions the
locked model memories left to design.

> Authoritative business model comes from engram `sdd/backend-products/product-model`
> (#1317), `sdd/backend-products/category-model` (#1318),
> `decision-commission-placement` (#1312) and the audit-fields convention (#1316).
> Those LOCK the fields; this document decides the HOW at architecture level. Tasks come next.

## Quick path (what gets built)

1. `packages/domain/src/product/` — `Product` + `Category` entities, invariants,
   pure `pricing.ts` (finalPrice/isOffer), `IProductRepository` + `ICategoryRepository`
   ports. Flat per-concept files mirroring `currency/`. Zero framework, zero I/O, zero float.
2. `packages/infra-db/` — `Product` + `Category` Prisma models (+ migration) and
   `PrismaProductRepository` / `PrismaCategoryRepository` implementing the ports.
3. `apps/api-salesops/src/product/` + `.../category/` — `ProductModule` / `CategoryModule`
   (controller + service) that wire the ports to Postgres and return decimals as strings,
   exposing derived `finalPrice`/`isOffer` in read responses.
4. Cleanup: delete dead `packages/domain/src/models/product.ts` + its barrel line.
5. Tests across the three native runners: domain=vitest, infra-db=jest, api-salesops=jest.

## The central decision — money reuse + derived pricing

**Decision: reuse the Currency `Money` VO (`bigint` minor units, scale 2, USD) for
`price` / `discountPrice` / `costoUSD`. `finalPrice` and `isOffer` are DERIVED by a
pure domain function using exact `bigint` arithmetic with a SINGLE HALF-UP division,
reusing the already-exported `divRoundHalfUp`. Nothing derived is ever stored.**

Grounded in the shipped VO at `packages/domain/src/currency/money.ts` and the shared
`divRoundHalfUp` at `packages/domain/src/currency/rate-resolver.ts:87` (re-exported
through the domain barrel). No new money type, no float on any money path.

### Pricing computation path (exact, single rounding)

```
// price, discountPrice: Money (USD, minorUnits = cents)
// percentDiscountPrice: bigint at PERCENT_SCALE = 2 (12.50% -> 1250n)
discountFromPercent = divRoundHalfUp(price.minorUnits * pct, 10_000n) // price × (pct/100)/100
finalCents          = price.minorUnits - discountFromPercent - discountPrice.minorUnits
finalPrice          = money(max(0n, finalCents), 'USD')               // clamp at 0
isOffer             = pct > 0n || discountPrice.minorUnits > 0n
```

Exactly ONE HALF-UP division (the percent term); the two subtractions and the clamp
are exact bigint ops. A drift test asserts no intermediate rounding — same discipline
as the Currency conversion path.

## Layer mapping (screaming architecture)

Dependency direction unchanged: `api-salesops → { domain, infra-db }`, `infra-db →
domain`, `domain → nothing`. The `domain → infra` edge is FORBIDDEN, enforced by the
`backend-boundaries` ESLint rule at `--max-warnings 0` across all three packages
(as Currency does).

### `packages/domain/src/product/` — pure core (vitest)

| File | Contract |
|------|----------|
| `product.ts` | `interface Product { id: string; name: string; description: string; sku?: string; barcode?: string; price: Money; percentDiscountPrice: bigint; discountPrice: Money; costoUSD: Money; categoryId: string; image: string; isNew: boolean; order: number; active: boolean; createdAt: Date; updatedAt: Date }`. Factory/guard `createProduct(input)` asserts invariants: `price.minorUnits > 0`; `0 ≤ percentDiscountPrice ≤ 100_00` (scale-2 bounds); `discountPrice.minorUnits ≥ 0`; all Money in `USD`. Throws `InvalidProductError`. |
| `pricing.ts` | Pure `finalPrice(product): Money` and `isOffer(product): boolean` per the computation above. Imports `divRoundHalfUp`, `money` from the domain currency barrel. No I/O. `PERCENT_SCALE = 2`, `percentFromDecimalString`/`percentToDecimalString` helpers (mirror `rateFromDecimalString`). |
| `category.ts` | `interface Category { id: string; name: string; slug: string; image?: string; icon?: string; order: number; active: boolean; createdAt: Date; updatedAt: Date }`. Factory `createCategory` asserts non-empty `slug`. FLAT — no `parentId`. |
| `product-repository.port.ts` | `interface IProductRepository { create(input): Promise<Product>; update(id, patch): Promise<Product>; softDelete(id): Promise<void>; findById(id): Promise<Product\|null>; list(filter?): Promise<Product[]> }` + `const PRODUCT_REPOSITORY = Symbol('IProductRepository')`. |
| `category-repository.port.ts` | `interface ICategoryRepository { create; update; softDelete; findById; findBySlug; list }` + `const CATEGORY_REPOSITORY = Symbol('ICategoryRepository')`. |
| `errors.ts` | `InvalidProductError`, `InvalidCategoryError` (named — grita, no adivina). |
| `index.ts` | Barrel; re-exported from `packages/domain/src/index.ts`. |

`softDelete` (set `active = false`) instead of a `delete` method: Ventas references
products by FK, hard-delete would orphan order history (locked open-decision #3).

### `packages/infra-db/` — adapters (jest + real Postgres)

| File | Contract |
|------|----------|
| `prisma/schema.prisma` | Append `Product` + `Category` models (below) + migration. |
| `src/product/prisma-product.repository.ts` | `@Injectable() class PrismaProductRepository implements IProductRepository`. Injects `PrismaService`. Maps Prisma `Decimal` (string) ↔ domain `Money` via `moneyFromDecimalString`/`moneyToDecimalString`; `percentDiscountPrice` Decimal ↔ scaled `bigint`. |
| `src/product/prisma-category.repository.ts` | `@Injectable() class PrismaCategoryRepository implements ICategoryRepository`. |
| `src/index.ts` | Export both repositories (mirror the `PrismaCurrencyRepository` export line). |

### `apps/api-salesops/src/product/` + `.../category/` — delivery (jest)

| File | Contract |
|------|----------|
| `product.module.ts` | `imports: [InfraDbModule]`; providers `ProductService`, `{ provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository }`; declares `ProductController`. Mirror `currency.module.ts`. |
| `product.service.ts` | Orchestration: inject `PRODUCT_REPOSITORY`, call domain `finalPrice`/`isOffer`, map `Money`→string. |
| `product.controller.ts` | REST CRUD; validates `categoryId`/decimals at the boundary; maps `InvalidProductError`→400. Read responses include `price`, `discountPrice`, `costoUSD`, `finalPrice`, `percentDiscountPrice` as strings + `isOffer` bool. |
| `dto/*.ts` | Every money/percent field typed `string` (mirror `create-rate.dto.ts`). |
| `category.*` | Symmetric `CategoryModule` CRUD. |

## Prisma schema (append to baseline)

```prisma
model Category {
  id        String    @id @default(uuid()) @db.Uuid
  name      String
  slug      String    @unique
  image     String?
  icon      String?
  order     Int
  active    Boolean   @default(true)
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  products  Product[]

  @@map("category")
}

model Product {
  id                   String   @id @default(uuid()) @db.Uuid
  name                 String
  description          String
  sku                  String?
  barcode              String?
  price                Decimal  @db.Decimal(18, 2) // Money(USD) — NUMERIC, never float
  percentDiscountPrice Decimal  @default(0) @db.Decimal(5, 2) @map("percent_discount_price")
  discountPrice        Decimal  @default(0) @db.Decimal(18, 2) @map("discount_price")
  costoUsd             Decimal  @db.Decimal(18, 2) @map("costo_usd")
  categoryId           String   @db.Uuid @map("category_id")
  image                String
  isNew                Boolean  @default(false) @map("is_new")
  order                Int
  active               Boolean  @default(true)
  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")
  category             Category @relation(fields: [categoryId], references: [id])

  @@index([categoryId])
  @@map("product")
}
```

- **Money as `Decimal`, not `BIGINT`** — the shipped Currency `exchange_rate.rate`
  column already established the `Decimal ↔ domain bigint via decimal-string` mapping
  (`prisma-currency.repository.ts:8`). Reusing it keeps ONE persistence convention,
  human-readable/queryable DB values, and lets the repo round-trip through the VO's
  own `moneyFromDecimalString`/`moneyToDecimalString`. `Decimal(18,2)` covers scale-2
  amounts with ample headroom. The rate column used `Decimal(18,6)`; money uses scale 2.
- **`percentDiscountPrice` as `Decimal(5,2)`**, NOT `Money` and NOT a plain integer:
  it is a percentage (0.00–100.00), so it must not carry a currency, and scale-2
  allows fractional rates like `12.50%`. Domain represents it as a `bigint` scaled by
  `PERCENT_SCALE = 2` to keep the `percent × price` product exact.
- Mutable master-data → BOTH `created_at` + `updated_at` per convention #1316
  (Currency was append-only, `created_at` only). Soft-delete via `active`.
- **Migration**: single additive `prisma migrate dev --name add_products_module`.
  Rollback = drop the migration; Currency + `salesops-mvp` untouched.

## Commission seam (Option B — documented, NOT implemented)

Product carries NO commission field. The future Gestores/Comisiones module will own a
separate `ProductCommissionReference { productId, comisionMN: Money }` and implement a
port Ventas consumes only when the module is enabled:

```ts
// FUTURE — owned by Gestores module, NOT created in this change:
interface ICommissionReferenceProvider {
  commissionFor(productId: string): Promise<Money | undefined>; // undefined/0 when module OFF
}
```

This change only NAMES the seam so Product stays commission-free. The current MVP
coupling `SeededProduct.commissionMN → pedidos-nuevo.tsx:80` is retired by this
boundary, not preserved (decision #1312).

## Seed & cleanup plan

- **Seed** — a SINGLE idempotent seed script (`packages/infra-db/src/product/seed.ts`, reads
  `apps/salesops-mvp/app/data/catalog.json`) that seeds everything in one run and can be
  re-run without duplicating: **upsert** the 11 slugs as `Category` rows keyed on the unique
  `slug` (`cafeteras, climatizacion, cocinas, energia-solar, freidoras, lavadoras, licuadoras,
  ollas, refrigeracion, tv-y-audio, utiles`; `name` humanized from `slug`); **upsert** existing
  catalog entries as `Product` rows linked by `categoryId`, keyed on a **deterministic UUID v5**
  derived from the catalog product id (never random UUIDs, so re-running is stable);
  `costoUsd = price*0.6` synthetic placeholder until a real supplier-cost source exists
  (open input #4). Idempotency is proven by `seed.spec.ts` (run twice → still exactly 11
  active categories + same product count, no duplicates).
- **Cleanup** (do BEFORE the new module lands): delete
  `templates/packages/domain/src/models/product.ts` (dead legacy `Product extends
  AuditableBaseModel` + `ProductCategory`, old poolops multi-tenant shape) and remove
  line 4 `export * from './models/product.js';` from
  `templates/packages/domain/src/index.ts`. `rg` confirms the barrel is the ONLY
  reference — zero real consumers. Removal is verified green by typecheck +
  `backend-boundaries` lint.

## Architecture decisions (ADR-style)

| # | Decision | Rejected alternative | Rationale |
|---|----------|----------------------|-----------|
| 1 | Reuse Currency `Money` VO for price/discountPrice/costoUSD | new money type; float | One VO, one convention; `money.ts` is proven, decimal-safe. |
| 2 | `finalPrice`/`isOffer` DERIVED by pure `pricing.ts`, never stored | stored `finalPrice`/`originalPrice` columns | Avoids contradictory-state trap (locked #1317); single source of truth = inputs. |
| 3 | Money stored as `Decimal(18,2)`, mapped ↔ `bigint` in repo | `BIGINT` minor units in DB | Mirrors shipped `exchange_rate` Decimal↔bigint mapping; human-readable, one persistence convention. |
| 4 | `percentDiscountPrice` = `Decimal(5,2)` / domain scaled `bigint` (scale 2) | plain int 0–100; `Money` | Percentage carries no currency; scale-2 supports 12.5%; scaled bigint keeps `pct×price` exact. |
| 5 | Single HALF-UP via reused `divRoundHalfUp` on the percent term | per-term rounding; decimal.js | Provable exactness, zero new deps; matches Currency drift discipline. |
| 6 | `Category` a real FLAT entity, required FK `Product.categoryId` | closed slug enum; hierarchy | Enum can't be reordered/deactivated without deploy (#1318); no nesting need. |
| 7 | Soft-delete (`active=false`) via port `softDelete`, no hard delete | hard delete | Ventas FK would orphan order history; keeps `id` stable. |
| 8 | Commission via future `ICommissionReferenceProvider` seam, NOT on Product | native `commissionMN` field | Product is CAPA BASE, stays independent of optional Gestores (#1312). |
| 9 | Flat per-concept files under `product/`, delete `models/product.ts` | keep `models/` convention | Mirrors `currency/`; dead legacy shape name-collides with new entity. |

## Testing / TDD strategy (three runners)

Strict TDD is active. Each test targets the runner native to its package.

| Test | Package / runner |
|------|------------------|
| `finalPrice`: percent + fixed discount, clamp at 0, single-rounding drift | domain / **vitest** |
| `isOffer` true/false; invariant guards (price>0, percent 0–100, discount≥0) | domain / vitest |
| `Money`/percent decimal-string round-trip fidelity | domain / vitest |
| Repo persist/read `Product`+`Category`; Decimal↔Money mapping; unique slug; FK | infra-db / **jest** (real Postgres) |
| Soft-delete flips `active`; `findBySlug` | infra-db / jest |
| CRUD endpoints return strings + derived `finalPrice`/`isOffer`; 400 on bad input | api-salesops / **jest** |

- infra-db + api jest runs need `NODE_OPTIONS=--experimental-vm-modules` (Prisma 7 WASM).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing dead `models/product.ts` breaks a hidden import | Low | `rg` shows only the barrel; typecheck + boundaries lint catch it |
| Percent representation confusion (scale-2 bigint vs plain number) | Med | Single `percentFromDecimalString`/`toDecimalString` helper + guard; DTOs are strings |
| Float drift in `percent × price` | Med | Reuse `divRoundHalfUp`, single HALF-UP; drift test proves it |
| Synthetic `costoUsd = price*0.6` mistaken for real cost | Med | Flag in seed comment + owner note; real source is open input #4 |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0` across all three packages |
| Category FK required blocks legacy products without a category | Low | Seed assigns every catalog product its slug's Category row |

## Open questions

- [x] Confirm `percentDiscountPrice` allows decimals (scale-2 `Decimal(5,2)`) vs integer-only. Confirmed: implemented as scale-2 `Decimal(5,2)` / scaled `bigint`; `pricing.test.ts` proves fractional round-trip (`"12.50"` <-> `1250n`) and the `14.50%` HALF-UP drift test.
- [x] Confirm `Decimal(18,2)` precision is sufficient for max product price. Confirmed: `Decimal(18,2)` mirrors the shipped `exchange_rate` convention and supports values well beyond any realistic product price (16 integer digits); no evidence found requiring a wider column.
- [ ] Real supplier-cost source for `costoUsd` (currently synthetic `price*0.6`) — explicitly OUT OF SCOPE for this change, documented in the seed script comment.

## Next step

`sdd-tasks` once the spec is also ready — break this design into ordered, testable
work units (entities+pricing → ports → schema/migration → repositories →
modules/endpoints → seed → cleanup), respecting the three-runner TDD map.
