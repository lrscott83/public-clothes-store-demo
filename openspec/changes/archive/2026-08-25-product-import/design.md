# Design: Idempotent Bulk Product Import (CSV)

## Technical Approach

Approach 1 (exploration, binding): one `list()` read per request over categories and products,
in-memory lowercase idempotency maps, zero schema/port changes. Controller adds one multipart
route mirroring the proven `POST /products/:id/image` pattern (`product.controller.ts:154-172`);
a new `ImportService` orchestrates parse → normalize → resolve → reuse existing
`ProductService.create`/`update` paths per row inside try/catch, returning a report DTO.
Pure helpers (CSV parser, title-caser, slugify) live in the domain package with colocated tests.

## Architecture Decisions

### D1 — Helper module placement

**Choice**: `templates/packages/domain/src/product/import-helpers.ts` exporting three pure functions:
`parseProductCsv(buffer, { maxRows })` → `{ ok: true, rows } | { ok: false, reason }`,
`toTitleCase(name)` (capitalize each whitespace-separated word — no Spanish special-casing),
`slugify(name)` (lowercase, NFD accent-strip, non-alphanumerics → `-`, collapse repeats).
**Alternatives**: app-local lib in api-salesops; separate `csv-parser.ts` + `text.ts` files.
**Rationale**: the domain package already hosts all pure product/category logic and its test
convention is colocated `*.test.ts` (`product.test.ts`, `category.test.ts`). These helpers encode
the CSV *business grammar* (header contract, caps), not transport detail — app-local would block
future reuse and break the hexagonal shared-kernel rule from `docs/system/architecture.md`. One
module keeps the import grammar cohesive (~130 lines). No new package; exported via the domain barrel.

### D2 — Endpoint shape and controller→service split

**Choice**: `POST /products/import` on the existing `@Controller('products')`, inheriting
`JwtAuthGuard, TenantContextGuard, RolesGuard` (L73); `@Roles(owner, admin)` +
`@HttpCode(HttpStatus.OK)`; `@UseInterceptors(FileInterceptor('csv'))`; `@UploadedFile` with
`ParseFilePipe(MaxFileSizeValidator({ maxSize: MAX_CSV_SIZE_BYTES }))` → **413**, where
`MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024` lives in a new `src/product/import-constraints.ts`
(mirrors `src/image/upload-constraints.ts`). Body: `runInTenant(req.tenant, () =>
this.importService.import(file.buffer))`. All parsing/normalization/orchestration lives in
`ImportService`; the controller stays thin like every sibling route.
**Alternatives**: parsing in controller; FileTypeValidator on the CSV.
**Rationale**: multipart precedent is in *this* app with identical guards; Multer memory storage
has no default cap so the validator is mandatory (exploration L24-26). A MIME check on `.csv` is
client-declared noise — content validation is the parser's job. Row cap (1000 data rows) enforced
by `parseProductCsv` → whole-file rejection.

### D3 — Orchestration inside ImportService (no transactions)

**Choice**: `ImportService` injects `PRODUCT_REPOSITORY`, `CATEGORY_REPOSITORY` and
`ProductService`. Flow:
1. `parseProductCsv` — fail-fast whole-file errors (header, row cap).
2. One `list({ includeInactive: true })` per repo → build maps: `lower(sku) → Product[]`,
   `` `${categoryId}|${lower(name)}` → Product ``, `lower(categoryName) → Category`.
3. Per row: validate currency/price/name (reusing `VALID_CURRENCIES` trio semantics;
   `moneyFromDecimalString` rejects >2-decimals), resolve category (create-on-miss: `toTitleCase`
   name, `slugify` + numeric-suffix loop verified via `findBySlug`; update local maps too).
4. Idempotency: sku-map length >1 → row FAILS ("SKU ambiguo"); unique match → `productService.update(id, patch)`
   with ONLY name/description/sku/barcode/price/categoryId (the partial-patch path at
   `product.service.ts:67-110` leaves cost/discount/image/isNew/order/active untouched);
   no match → `productService.create` with cost `0.00` in price currency, active=true,
   order = local max-per-category+1.
5. Every row wrapped in try/catch → collected result. **No transaction** — row-by-row commits;
   rerun is safe by idempotency keys.
**Alternatives**: per-row repo lookups (new port methods); Prisma upsert + unique constraint.
**Rationale**: both alternatives touch port/schema (owner-fixed out); the partial-update path
already implements "update values only" exactly.

### D4 — Report DTO

```ts
interface ImportReportDto {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  rows: Array<{
    line: number;                                  // 1-based CSV data-row number
    status: 'created' | 'updated' | 'failed';
    name?: string;                                 // stored (Title Case) name
    reason?: string;                               // Spanish, failed rows only
  }>;
}
```

### D5 — Error mapping

| Condition | Status | Reason |
|---|---|---|
| File part missing | 400 | "Falta el archivo CSV." |
| Bad/missing header | 400 | names expected header |
| >1000 data rows | 400 | states row cap |
| File >5MB (Multer pipe) | 413 | size cap |
Row failures **never throw** — they are report entries. Guards produce the standard 401/403 contract.

### D6 — web-catalog console

**Choice**: register `route('admin/productos/importar', 'admin/routes/productos/importar.tsx')`
inside the `_auth.tsx` layout block (`routes.ts:21-31`) — redirect behavior inherited free.
Route file mirrors `nuevo.tsx`: `loader`/`action` wrapped in `withAuth`; action reads
`formData.get('csvFile')`, forwards as FormData field `csv` through new
`importProducts(request, companyId, formData)` in `products.server.ts` (clone of
`uploadProductImage`, L73-84 — no Content-Type header). Thrown raw `Response` → status-mapped
Spanish voseo message (403/413/400 branches). Success renders `ImportReportTable`
(presentational, colocated in the route file like `NuevoProductoPage`) styled after
`productos/index.tsx`. Copy: "Importar productos", "Subí tu archivo CSV", reasons from API.
**Alternatives**: client-side fetch; separate component directory.
**Rationale**: server-side action matches every admin route; no JS-side auth handling exists.

## Data Flow

```
Browser form (multipart csvFile)
  └─ action() ── FormData('csv') ──▶ api-salesops POST /products/import
       (withAuth → Bearer + X-Company-Id)        │ guards → runInTenant
                                                 ▼
                                    ImportService.import(buffer)
                                       │ parseProductCsv (pure)          ← whole-file reject?
                                       │ list() ×2 → in-memory maps
                                       ├─ per row: normalize → resolve cat
                                       │     → productService.create/update (try/catch)
                                       ▼
                                    ImportReportDto ── JSON ──▶ report table render
```

## File Changes (line estimates ≈ 1050 total incl. tests)

| File | Action | ~Lines |
|------|--------|--------|
| `templates/packages/domain/src/product/import-helpers.ts` | Create | 130 |
| `templates/packages/domain/src/product/import-helpers.test.ts` | Create | 200 |
| `templates/packages/domain/src/index.ts` | Modify | +2 |
| `templates/apps/api-salesops/src/product/import-constraints.ts` | Create | 5 |
| `templates/apps/api-salesops/src/product/import.service.ts` | Create | 170 |
| `templates/apps/api-salesops/src/product/import.service.spec.ts` | Create | 240 |
| `templates/apps/api-salesops/src/product/product.controller.ts` | Modify | +25 |
| `templates/apps/api-salesops/src/product/product.controller.spec.ts` | Modify | +50 |
| `templates/apps/web-catalog/app/routes.ts` | Modify | +1 |
| `templates/apps/web-catalog/app/admin/lib/products.server.ts` | Modify | +18 |
| `templates/apps/web-catalog/app/admin/lib/products.server.test.ts` | Modify | +30 |
| `templates/apps/web-catalog/app/admin/routes/productos/importar.tsx` | Create | 150 |
| `templates/apps/web-catalog/app/admin/routes/productos/__tests__/importar.test.tsx` | Create | 160 |

## Interfaces / Contracts

HTTP: `POST /products/import`, `multipart/form-data`, field `csv`. 200 → `ImportReportDto`;
400/413/401/403 per D5. See D4 for DTO. No port, entity, or schema changes.

## Testing Strategy (spec scenario → test file; 19 scenarios in spec.md)

| Spec scenario | Test home |
|---|---|
| S1 BOM/CRLF/quoted parse · S2 wrong header · S3 row cap | `import-helpers.test.ts` (parser units) + service-level whole-file rejection |
| S3 size cap | `product.controller.spec.ts` (413 via MaxFileSizeValidator) |
| S4 currency default GBP invalid · S5 invalid price row-only · S6 TitleCase create/update · S7 category created once+shared · S8 accents distinct · S10 update leaves fields · S11 ambiguous sku · S12 new-product defaults · S13 mixed no-abort · S9/S14 rerun zero-dups / crash recovery | `import.service.spec.ts` — Nest TestingModule with **stateful in-memory fake repos** (repo convention is mocked ports, `product.service.spec.ts:11-30`; fakes let run-twice idempotency be proven deterministically without Postgres) |
| S15 unauthorized role · S16 tenant scope | `product.controller.spec.ts` — Roles chain + `runInTenant` wrapping asserted like sibling writes |
| S17 report table · S18 rejection message | `__tests__/importar.test.tsx` (component/action render) |
| S19 auth-layout redirect | route registration assert in `importar.test.tsx` + `_auth` layout's existing behavior |

Plus `products.server.test.ts`: `importProducts()` posts FormData without Content-Type and throws raw Response on !ok.

## Threat Matrix

N/A — no routing/shell/subprocess, VCS/PR automation, executable-file classification, or
process-integration boundary. New attack surface (multipart upload) is bounded by the existing
guard chain plus size/row caps (D2/D5).

## Migration / Rollout

No migration required. Rollback: remove route registration, then controller/service, then helpers.

## Risks

- **Rerun-idempotency proof depends on fake-repo fidelity** — mitigate by mirroring Prisma
  soft-delete/list semantics exactly in fakes; optionally add a real-Postgres integration spec in
  infra-db later (deferred, keeps budget).
- **TitleCase rewrite on UPDATE surprises users** — accepted by owner; report shows final names.
- **Slug suffix loop does O(k) findBySlug calls** on collisions — negligible at catalog scale.

## Open Questions

None blocking. Accent handling in slugs fixed (strip, per proposal); matching stays
accent-significant (owner decision).
