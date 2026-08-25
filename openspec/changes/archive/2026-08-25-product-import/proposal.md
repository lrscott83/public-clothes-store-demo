# Proposal: Idempotent Bulk Product Import (CSV)

## Intent

Catalog-type stores load inventory from spreadsheets. Today admins create products one by one at `/admin/productos/nuevo` — loading hundreds of rows by hand is slow and error-prone. This change adds `/admin/productos/importar`: upload a UTF-8 CSV (`categoria;nombre;precio;moneda;barcode;sku;descripcion`, `;` separator) and get a per-row report (creadas / actualizadas / errores con motivo) in Spanish voseo copy consistent with the existing admin.

## Scope

### In Scope
- `POST /products/import` in api-salesops: multipart via `FileInterceptor('csv')`, Roles owner/admin guard chain, own `MaxFileSizeValidator` (5MB cap — Multer has none) plus a **1000-row batch cap**.
- Pure, unit-tested helper modules: RFC-4180-style CSV parser (`;`, quoted fields, UTF-8 BOM, CRLF), Camel Case name normalizer, slugify.
- Batch-time idempotency over ONE `list()` read per request (exploration Approach 1): map keyed by `lower(sku)` and `lower(categoryId|name)`. Existing match → UPDATE values only; missing → CREATE. Ambiguous sku (>1 hit) → row FAILS with clear reason.
- Categories matched by NAME case-insensitively (accents ARE significant); missing → created with slug derived from Camel Case name (lowercase, accents stripped, hyphenated; collision suffix verified via `findBySlug`). Both product and category names always stored Camel Case.
- `moneda` empty → `MN`; only USD|EUR|MN valid. `cost` defaults `0.00` in price currency. Empty `descripcion` → empty string. Row errors never abort the batch.
- web-catalog upload form + result table; `importProducts()` server client mirroring `uploadProductImage`.

### Out of Scope
- No schema migration, no new repository query methods (port untouched).
- No discount/image/isNew columns today.
- No async/streaming for huge files — row cap keeps batches synchronous.
- No accent-insensitive name matching (owner-fixed: accents significant).
- Future: template download, dry-run mode, larger-file chunking.

## Capabilities

### New Capabilities
- `salesops-product-import`: end-to-end CSV import contract — file constraints, column grammar, idempotency keys, ambiguity failure, Camel Case/slug normalization rules, defaults, row-report shape, and the admin upload page.

### Modified Capabilities
None. `salesops-products`' entity/CRUD contract is unchanged (import reuses validated create/update paths; `cost` default 0.00 needs no schema change). Import-specific requirements are orthogonal to that spec and would bloat it; a dedicated spec stays cohesive. `catalog-admin` already declares bulk operations out of scope there.

## Approach

Controller route wraps tenant context like existing endpoints; service loads categories + products once, builds lowercased-keyed maps, resolves rows against them (creating categories on the fly, updating local maps too), then calls existing `create`/`update` orchestration per row inside per-row try/catch. Helpers live in `packages/domain/src/product/` as pure functions with colocated tests.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `templates/apps/api-salesops/src/product/product.controller.ts` | Modified | New `POST /products/import` multipart route |
| `templates/apps/api-salesops/src/product/` | New | Import service (batch orchestration + report) |
| `templates/packages/domain/src/product/` | New | CSV parser, camelCase, slugify (pure + tests) |
| `templates/apps/web-catalog/app/routes.ts` | Modified | Register `admin/productos/importar` |
| `templates/apps/web-catalog/app/admin/routes/productos/importar.tsx` | New | Upload form + result table (+ test) |
| `templates/apps/web-catalog/app/admin/lib/products.server.ts` | Modified | `importProducts()` client |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Camel Case rewrite of stored names on UPDATE surprises users | Med | Explicit owner decision; report shows resulting names |
| Non-unique SKU data causes wrong-target update | Low | Ambiguous rows FAIL loudly, never guess |
| Concurrent writers stale the in-memory map mid-batch | Low | Accepted: admin-only bulk tool; rerun is idempotent |
| Oversized/garbage upload buffers memory | Low | Size + row caps; parser rejects malformed rows |

## Rollback Plan

Revert the change commits (commits-on-main, small units): remove route registration first (page unreachable), then controller/service, then helpers. No migrations or data backfills exist to undo; imported products remain but are editable/deletable normally.

## Dependencies

- None external. No new npm packages (hand-rolled parser; zero CSV libs in monorepo).

## Success Criteria

- [ ] A mixed CSV (new + existing + ambiguous-sku + invalid-currency rows) imports with correct per-row outcomes; batch never aborts
- [ ] Re-running the same CSV produces zero duplicates (idempotency proven by test)
- [ ] Names/categories always stored Camel Case; created categories have valid unique slugs
- [ ] Public API never exposes `cost`; all helpers and endpoint covered by tests
