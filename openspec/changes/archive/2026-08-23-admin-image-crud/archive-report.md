# Archive Report — admin-image-crud

**Date**: 2026-08-23
**Verdict**: ARCHIVED — cycle closed; implementation and final verification complete before archive.

## What Shipped

The `admin-image-crud` change made product and category images optional and fully
admin-manageable end to end: the domain's `IProductImageStore` port generalised to a
collection-aware `IImageStore` (`products` | `categories`) with `assertImageRef` and
`isUploadMintedRef` guards; `packages/infra-storage` ships a single two-collection
`FsImageStore` adapter; `Product.image` became nullable in both the master Prisma schema
(migration `ALTER ... DROP NOT NULL`) and the tenant schema / regenerated
`tenant-schema.sql`; `api-salesops` gained authenticated product and category image
upload/replace/remove endpoints with hardening that rejects upload-minted refs arriving
through create/update bodies; `api-public` returns `imageUrl: null` for imageless products;
`web-catalog` replaced both raw-ref text inputs with admin CRUD image UI (file upload,
replace, remove, placeholders, thumbnails) proxied through its own `withAuth`-guarded
resource routes. Per-package coverage gates were kept as ratchets throughout.

## Artifact Inventory

| Artifact | Status |
|---|---|
| design.md | ✅ present |
| tasks.md | ✅ present — 90/90 tasks checked, 0 unchecked |
| specs/salesops-products/spec.md | ✅ present — merged into master spec at archive time |
| proposal.md | ❌ never existed — intentional lightweight change |
| verify-report.md | ❌ never existed — intentional lightweight change |
| apply-progress.md | N/A — never existed |

**Lightweight shape was intentional**: this change was authored as design + tasks only.
In place of a persisted verify-report, Phase 7 final verification was executed directly
and its evidence is committed in the b859fb3 / 78ee247 lineage (pushed to origin/main):

- lint 12/12 turbo tasks, typecheck 18/18 green
- unit/integration suites green across all 12 packages/apps, including infra-db 437/437
  against real Postgres 17, api-salesops 538/538, api-public 62/62
- api-salesops e2e 125/125 against real Postgres
- plan invariants proven: old port names (`IProductImageStore` etc.) gone from the codebase,
  no raw-ref inputs survive, `image String?` nullable in both Prisma schemas and
  `tenant-schema.sql`

## Spec Sync Record

- **salesops-products** — MODIFIED requirement **"Product Master-Data Entity"**:
  field-table row `image` changed from `—` to `nullable, default null`; scenario
  "Product created with required fields" now lists `sku`/`barcode`/`image` nullable.
  No added or removed requirements. Delta preamble (explanatory blockquote) intentionally
  NOT merged into the master spec. All other requirements preserved untouched, including
  "Category Master-Data Entity" (category image already documented as nullable).

## Task Completion Gate / Final-State Authority Note

tasks.md checkboxes were reconciled to 90/90 at final verification (commit b859fb3) after
the implementation work had landed. That reconciliation is recorded here per the
stale-checkbox exception: the persisted artifact is the source of truth for completion
visibility and reflects final state as of close.

## Mechanical Copy Contract

Pre-move recursive snapshot compared against the archived folder via `diff -r`: empty
output, exit 0 — byte-identical. This archive-report is additive-only and did not exist
in the source snapshot.
