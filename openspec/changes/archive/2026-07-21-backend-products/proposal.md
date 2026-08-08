# Proposal: Products (Productos) Module — catalog master-data slice

## Intent

Products is the **CAPA BASE** root entity of the salesops backend — the master-data table Ventas, Inventario and Finanzas all reference (`docs/plans/estrategia-backend-por-modulos.md`). Today the catalog is a client-side blob: `templates/apps/salesops-mvp/app/data/catalog.json` (11 fixed category slugs, ids as bare strings `"1"`, `price` as a raw JS `number`) enriched at seed-build by `app/seed/enrich-products.ts`. Money lives as float and `costUSD` is a synthetic `price*0.6` heuristic — both debt. This change ships the first master-data vertical slice: a pure `Product` domain entity with decimal-safe `Money` for price/cost, persisted behind a port, exposed via a thin CRUD module — mirroring the shipped Currency slice end-to-end.

## Scope

### In Scope
- Domain (`@store-mgmt/domain/src/product`): `Product` entity `{ id, name, description, categoryId, precioUSD: Money, costoUSD: Money, image }`, invariants, `IProductRepository` port. Flat per-concept files mirroring `currency/` (no `models.ts` wrapper).
- **Money VO reuse**: `precioUSD` / `costoUSD` are the existing `Money` VO from `@store-mgmt/domain` currency, in USD. No new money type.
- Persistence: Prisma `Product` model in `infra-db/prisma/schema.prisma` (DECIMAL money columns); `PrismaProductRepository implements IProductRepository`; load real catalog from `catalog.json`.
- Delivery: `ProductModule` in `api-salesops` — CRUD endpoints (create/list/get/update/delete), decimals as strings, mirroring `CurrencyModule`.
- Cleanup: explicit disposition of the dead `templates/packages/domain/src/models/product.ts` export (see Migration).

### Out of Scope
- **Commission on Product** — the base entity carries NO commission field (see Boundaries). No Gestores/Comisiones module here.
- Variants, pricelists, generic product-attribute system ("qué NO copiamos", strategy doc).
- Ventas / Inventario / storefront integration — those are their own modules; this change only notes the seams.
- Real supplier-cost ingestion pipeline (the real cost source is an open input; MVP `price*0.6` is a placeholder).

## Capabilities

### New Capabilities
- `salesops-products`: `Product` catalog entity with decimal-safe USD price/cost (Money VO), category reference, master-data CRUD behind a repository port, and HTTP endpoints. Distinct from `salesops-currency`, `salesops-backend`, `salesops-mvp`.

### Modified Capabilities
- None.

## Decided Architectural Boundaries (do not re-open)

- **Money reuse**: price and cost are ONE `Money` in the fixed buy currency (USD today), reusing `moneyFromDecimalString`/`moneyToDecimalString`. A mono-currency deploy is valid — `rate-resolver.ts` fabricates a USD identity rate on empty rates; storing/reading Money never requires rate rows.
- **Commission = Option B (add-on seam, owner-decided)**: the "comisión de referencia" is NOT on Product. It is owned by the future Gestores/Comisiones module as a separate `ProductCommissionReference { productId, comisionMN: Money }` linked by `productId`, read by Ventas through a port/bridge (e.g. `ICommissionReferenceProvider`) only when that module is enabled, degrading to 0/undefined otherwise. This change does NOT implement Gestores — it only ensures Product stays commission-free and names the seam a later module fills. Note: today's MVP hard-couples `SeededProduct.commissionMN` → `pedidos-nuevo.tsx:80`; that coupling is retired by this boundary, not preserved.

## Open Decisions — carry into spec/owner (present, not silently resolved)

| # | Decision | Recommendation (needs confirmation) |
|---|----------|-------------------------------------|
| 1 | **Category**: closed enum of the 11 `catalog.json` slugs vs a real `Category` master-data entity | Start with a **closed enum** of the 11 slugs (matches current data, zero extra table); promote to a `Category` entity only when the taxonomy needs its own CRUD/attributes. Confirm. |
| 2 | **SKU/código**: none today (`id` is a bare sequential string) | Do NOT add a human-readable SKU in this slice; keep `id` as PK. Add `sku` only when a real coding scheme exists. Confirm. |
| 3 | **Soft-delete / `active` flag**: MVP has none | ADD an `active: boolean` (soft-delete). "Discontinuar sin perder historial de ventas" is a real requirement once Ventas references products by FK — hard-delete would orphan order history. Confirm. |
| 4 | **Real cost source**: `costUSD` is a synthetic `price*0.6` heuristic, not supplier cost | Store `costoUSD` as real `Money`, but the ingestion of a REAL supplier cost is an open input — seed keeps the heuristic until a real source exists. Flag for owner. |
| 5 | **Storefront-only fields** (`images`, `isNew`, `discount`, `originalPrice`) | Treat as storefront presentation data OUTSIDE this module's core schema; no backend business logic reads them. Keep Product lean. Confirm. |

## Migration / Cleanup

- **Dead `templates/packages/domain/src/models/product.ts`** (old poolops multi-tenant `Product extends AuditableBaseModel`, barrel-exported from `@store-mgmt/domain`, zero consumers, name-collides with the new module): **DELETE it and its barrel export before the new module lands.** It predates the per-concept-subfolder convention and would shadow the real `Product` entity. If the owner wants to keep it for an unrelated future multi-tenant use, rename/deprecate explicitly — but the default disposition is delete.
- Catalog load: `catalog.json` becomes the seed source for `PrismaProductRepository`; the storefront `StoreProduct` type stays where it is (not merged into the domain entity).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/domain/src/product/` | New | `Product` entity, invariants, `IProductRepository` port |
| `packages/domain/src/models/product.ts` | Removed | Dead legacy `Product` export + barrel line |
| `packages/infra-db/prisma/schema.prisma` | Modified | `Product` model (DECIMAL money columns) |
| `packages/infra-db/src/product/` | New | `PrismaProductRepository` |
| `apps/api-salesops/src/product/` | New | `ProductModule` + CRUD endpoints + DTOs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Removing dead `models/product.ts` breaks a hidden import | Low | `rg` confirms zero consumers; boundaries lint + typecheck catch it |
| Commission boundary regresses MVP behavior | Med | Boundary is intentional; document the retired `pedidos-nuevo.tsx:80` coupling for the future Ventas/Gestores port |
| Float drift in price/cost | Med | Reuse `Money` VO (DECIMAL + scale-2 + HALF-UP) — no new logic |
| Category enum too rigid | Low | Enum is reversible to a `Category` entity later (open decision #1) |
| Boundary leak (domain → infra) | Low | `backend-boundaries` lint `--max-warnings 0`, mirroring Currency |

## Rollback Plan

Self-contained: revert the feature branch. The `Product` Prisma model is additive — drop the migration. Restoring `models/product.ts` is a single-file revert. Untouched Currency module, `salesops-mvp` SPA and `@store-mgmt/domain` currency exports remain intact.

## Dependencies

- Shipped Currency slice (reference impl + `Money` VO): `packages/domain/src/currency/*`, `packages/infra-db/src/currency/*`, `apps/api-salesops/src/currency/*`.
- Backend base scaffold (`api-salesops`, `infra-db`, docker Postgres).
- Owner confirmation on open decisions #1–#5 before spec finalizes the schema.

## Success Criteria

- [ ] `Product` domain entity with `precioUSD`/`costoUSD` as `Money(USD)`, no commission field, passes TDD.
- [ ] Prisma `Product` model + `PrismaProductRepository` persist/read against real Postgres; catalog loads from `catalog.json`.
- [ ] `ProductModule` CRUD endpoints return decimals as strings.
- [ ] Dead `models/product.ts` removed; barrel and typecheck green.
- [ ] Domain imports the port, never the Prisma impl; boundaries lint green.
- [ ] Commission seam documented (no Product field); Gestores port named, not implemented.
