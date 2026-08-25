# Tasks: Idempotent Bulk Product Import (CSV)

Commits on `main`. **No PRs, no chaining.** Strict TDD per task: RED (failing test, run it) â†’ GREEN (implement, run green) â†’ commit. Runners: NestJS â†’ jest co-located `*.spec.ts`; domain package â†’ colocated `*.test.ts`; `web-catalog` â†’ vitest + jsdom + testing-library. Code/comments English, UI copy Spanish voseo. Conventional commits, no AI attribution.

## Review Workload Forecast

| Field | Value |
|---|---|
| Delivery strategy | Commits only on `main` â€” explicitly NO PRs, so NO chained-PR split |
| Estimated changed lines | ~1050 incl. tests (design File Changes table): production ~501, tests ~680 outside production budget |
| 400-line budget risk | High vs the default PR budget, but **acceptable under commits-only delivery** (no PR review slice exists to protect) â€” advisory only |
| Chained PRs recommended | No |
| Suggested split | Not applicable â€” single linear commit series on `main`, one commit per task; largest phase (Phase 2) already split into commit-sized tasks |
| Largest phase | Phase 2 (~410 lines incl. its tests) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: N/A (commits-only delivery)
400-line budget risk: High (accepted â€” commits-only delivery)

## Phase 1 â€” Domain Pure Helpers (`templates/packages/domain`)

- [x] 1.1 RED: create `src/product/import-helpers.test.ts` parser units â€” UTF-8 BOM + CRLF + quoted field containing `;` parses fully (spec S1); wrong/missing header rejects whole file naming expected header (S2); 1001 rows rejected stating row cap (S3-row). GREEN: `parseProductCsv(buffer, { maxRows })` returning `{ok:true,rows}|{ok:false,reason}` per D1. Commit.
- [x] 1.2 RED: same file â€” `toTitleCase('iphone case') === 'Iphone Case'`, multi-word/multi-space cases, no Spanish special-casing (S6). GREEN: implement `toTitleCase` (capitalize each whitespace-separated word). Commit.
- [x] 1.3 RED: same file â€” `slugify` lowercases, strips accents via NFD, hyphenates non-alphanumerics, collapses repeats; `ClimatizaciÃ³n` â†’ `climatizacion` (S8 slug side). GREEN: implement `slugify`. Commit.
- [x] 1.4 Export the three helpers from `templates/packages/domain/src/index.ts` (+2). Verify: domain package `typecheck` + existing `product.test.ts`/`category.test.ts` green UNCHANGED. Commit only if barrel not already covered by 1.1â€“1.3 commits.

## Phase 2 â€” api-salesops Import Endpoint

- [x] 2.1 Create `src/product/import-constraints.ts`: `MAX_CSV_SIZE_BYTES = 5 * 1024 * 1024` (D2, mirrors `upload-constraints.ts`). Verify-only (constant).
- [x] 2.2 RED: create `src/product/import.service.spec.ts` â€” Nest TestingModule with stateful in-memory fake repos (mirror Prisma soft-delete/list semantics, D3/testing table). Cases: currency emptyâ†’MN persisted, GBPâ†’row fails listing valid currencies (S4); precio `0`/-5/non-numeric fails row only (S5); TitleCase stored on create and update (S6). GREEN: implement these validation branches. Commit.
- [x] 2.3 GREEN: create `src/product/import.service.ts` per D3 flow â€” parse fail-fast, one `list()` Ã—2 â†’ maps, per-row validation, category resolve/create-on-miss with slug suffix loop via `findBySlug`, local-map updates. Covers 2.2 cases. Commit.
- [x] 2.4 REDâ†’GREEN extend both files: missing category created ONCE and shared by later rows (S7); accent-differentiated names stay distinct (S8); ambiguous sku fails without writing either product (S11); new-product defaults cost 0.00/order max+1/active (S12). Commit.
- [x] 2.5 REDâ†’GREEN extend both files: re-run identical file â†’ every row 'updated', counts unchanged (S9); update touches ONLY name/description/sku/barcode/price/categoryId â€” cost/isNew/discounts/image/active/order persist (S10); mixed CSV never aborts, report lists every outcome (S13); interrupted-batch recovery rerun (S14). Assert report DTO shape per D4. Commit.
- [x] 2.6 RED: modify `src/product/product.controller.spec.ts` â€” `POST /products/import` behind JwtAuthGuard+TenantContextGuard+RolesGuard with `@Roles(owner, admin)` (S15); body wraps `runInTenant(req.tenant, â€¦)` scoped to caller company (S16); oversized file â†’ 413 via MaxFileSizeValidator (S3-size); missing part â†’ 400 (D5). GREEN: add route to `product.controller.ts` (+25, FileInterceptor('csv')). Commit.

## Phase 3 â€” web-catalog Admin Console

- [ ] 3.1 RED: modify `app/admin/lib/products.server.test.ts` â€” `importProducts()` posts FormData field `csv` WITHOUT Content-Type header and throws raw Response on !ok (mirrors `uploadProductImage`). GREEN: add `importProducts(request, companyId, formData)` (+18). Commit.
- [ ] 3.2 RED: create `app/admin/routes/productos/__tests__/importar.test.tsx` â€” success response renders report table with totals + per-row Spanish reasons (S17); 400/403/413 raw Response renders mapped Spanish voseo rejection message, no partial table (S18); route registered under `_auth` layout block so anonymous visitor redirects to login (S19). GREEN: register `route('admin/productos/importar', â€¦)` in `routes.ts` (+1) and create `importar.tsx` (+150): loader/action via `withAuth`, action reads `csvFile`, renders form + presentational `ImportReportTable` styled after `productos/index.tsx`. Commit.

## Phase 4 â€” Final Verification

- [ ] 4.1 Full gates: `pnpm turbo run lint typecheck test` monorepo-wide; `test:cov` at each touched package; standalone fix commits if needed.
- [ ] 4.2 Live round-trip against running stack: import mixed CSV once â†’ report correct; import SAME CSV again â†’ all rows 'actualizada', zero duplicates (S9 live); bad-header and >5MB uploads rejected with Spanish messages (S2/S3-size live).
- [ ] 4.3 Diff audit: port/entity/schema untouched (proposal Out of Scope); rollback order sanity: remove route â†’ controller/service â†’ helpers.

## Spec Scenario Map

| Scenario | Task |
|---|---|
| S1 BOM/CRLF/quoted parse | 1.1 |
| S2 wrong header whole-file reject | 1.1, 4.2 |
| S3 row cap / size cap | 1.1, 2.6, 4.2 |
| S4 currency default GBP invalid | 2.2â€“2.3 |
| S5 invalid price row-only | 2.2â€“2.3 |
| S6 TitleCase create/update | 1.2, 2.2â€“2.3 |
| S7 category created once + shared | 2.4 |
| S8 accents distinct | 1.3, 2.4 |
| S9 rerun zero duplicates | 2.5, 4.2 |
| S10 update leaves fields | 2.5 |
| S11 ambiguous sku fails | 2.4 |
| S12 new-product defaults | 2.4 |
| S13 mixed no-abort | 2.5 |
| S14 crash recovery | 2.5 |
| S15 unauthorized role | 2.6 |
| S16 tenant scope | 2.6 |
| S17 report table render | 3.2 |
| S18 rejection message | 3.2 |
| S19 auth-layout redirect | 3.2 |
