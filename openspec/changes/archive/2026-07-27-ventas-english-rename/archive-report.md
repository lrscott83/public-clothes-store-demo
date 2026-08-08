# Archive Report: ventas-english-rename

**Date**: 2026-07-27  
**Change**: ventas-english-rename  
**Branch**: salesops-rename-ventas (HEAD: 0c50ca1, 64 commits, pushed to origin, no PR)  
**Artifact Store**: hybrid (engram + openspec)  
**Verdict**: PASS WITH WARNINGS — Warnings resolved; 2 accepted deviations recorded below.

## Executive Summary

The `ventas-english-rename` SDD change translated all remaining Spanish-language backend identifiers and labels to English across the Order (Sales) and Currency domains. All 7 work units are complete, all 8 locked naming decision blocks (A–H) were implemented and independently re-verified, the full test matrix passes (590/590 tests: 238 domain + 121 infra-db + 181 api-salesops + 50 e2e), lint is clean, and build exits 0. This is a **pure identifier + label rename** with zero behavior change. The change has been archived and is ready for release.

## Lineage & Artifact IDs

All SDD artifacts recorded with Engram observation IDs for complete traceability:

| Artifact | Type | Engram ID | Topic Key |
|----------|------|-----------|-----------|
| Exploration | architecture | #1523 | `sdd/ventas-english-rename/explore` |
| Proposal | architecture | #1532 | `sdd/ventas-english-rename/proposal` |
| Locked Naming Decisions | decision | #1529 | `sdd/ventas-english-rename/naming-decisions` |
| Naming Conflicts (discovery) | discovery | #1533 | `sdd/ventas-english-rename/naming-conflicts` |
| Tasks | architecture | #1534 | `sdd/ventas-english-rename/tasks` |
| Apply Progress | architecture | #1536 | `sdd/ventas-english-rename/apply-progress` |
| Verify Report | architecture | #1550 | `sdd/ventas-english-rename/verify-report` |
| Post-Verify Residue Cleanup | bugfix | #1552 | `sdd/ventas-english-rename/residue-cleanup` |
| **Archive Report** | **architecture** | **(this document)** | **`sdd/ventas-english-rename/archive-report`** |

## Scope & Locked Naming Blocks

All 8 naming blocks from LOCKED decision #1529 were implemented and independently verified compliant:

### Block A: OrderStatus Values
- `creado` → `created`
- `verificado` → `verified`
- `entregado` → `delivered`
- `cancelado` → `cancelled` (2 L's, matches existing repo convention)

**Status**: ✅ DONE (WU2, commit df3fc7c)

### Block B: DeliveryMode Values
- `recogida` → `pickup`
- `domicilio` → `delivery`

**Mitigation**: Comment added to type definition stating DeliveryMode and OrderStatus are independent axes. A `pickup` order can reach `delivered`.

**Status**: ✅ DONE (WU2, commit df3fc7c)

### Block C: PaymentChannel Values
- `USD_EFECTIVO` → `USD_CASH`
- `EUR_EFECTIVO` → `EUR_CASH`
- `MN_EFECTIVO` → `MN_CASH`
- `MN_TRANSFERENCIA` → `MN_TRANSFER`
- `ZELLE` unchanged

**Status**: ✅ DONE (WU2, commit df3fc7c; schema.prisma 16–21)

### Block D: Folder Renames
- `packages/domain/src/ventas/` → `packages/domain/src/sales/`
- `packages/infra-db/src/ventas/` → `packages/infra-db/src/sales/`
- `apps/api-salesops/src/ventas/` → `apps/api-salesops/src/sales/`

**Rationale**: `sales` is the bounded context; `Order` is the aggregate inside it.

**Status**: ✅ DONE (WU1, commit b435452)

### Block E: Class/File Renames (api-salesops)
- `VentasController` → `OrderController` (`order.controller.ts`)
- `VentasService` → `OrderService` (`order.service.ts`)
- `VentasModule` → `SalesModule` (`sales.module.ts` — module carries context name, controller/service carry aggregate name)
- Field `ventasService` → `orderService`
- Test files: `order.controller.spec.ts`, `order.service.spec.ts`, `test/order.e2e-spec.ts`

**Zero Wire Impact**: `@Controller('orders')` route unchanged.

**Status**: ✅ DONE (WU1, commit b435452)

### Block F: Seed & Constants
- Variable `VENTAS_SEED_NAMESPACE` → `SALES_SEED_NAMESPACE` (UUID value unchanged)
- Upsert key slug `'ventas-seed-demo'` → `'sales-seed-demo'` (persisted lookup key; migration includes `UPDATE category SET slug = 'sales-seed-demo' WHERE slug = 'ventas-seed-demo'`)
- Display name `'Ventas Demo'` → **STAYS SPANISH** (user-facing; locked MUST-NEVER-RENAME)

**Status**: ✅ DONE (WU3, commit 9ec2caa)

### Block G: Currency Module Functions & Parameters
- Function `resolverTasa` → `resolveRate`
- Function `convertir` → `convert`
- Function `convertirEntreMonedas` → `convertBetweenCurrencies`
- Parameter `origen` → `source` (not `from` — DTO already uses `input.from` as currency string)
- Parameter `monedaDestino` → `targetCurrency`
- Local `destinoMinorUnits` → `targetMinorUnits`
- Local `origen` in `currency.service.ts:59` → `source`

**Status**: ✅ DONE (WU5, commit 6d722f2)

### Block H: Spanish Display Labels (Additive)
- NEW: `packages/domain/src/sales/labels.ts` with `ORDER_STATUS_LABELS_ES`, `DELIVERY_MODE_LABELS_ES`
- NEW: `PAYMENT_CHANNEL_LABELS_ES` in `packages/domain/src/currency/payment-channel.ts`
- NEW: `statusLabel`, `deliveryModeLabel` fields on `OrderResponseDto` (computed in `OrderService`)
- Mirrors existing `ROLE_LABELS_ES` / `RoleHelpers` precedent (users module)
- Values (neutral LatAm Spanish): Creado, Verificado, Entregado, Cancelado, «Recogida en tienda», «Envío a domicilio», Zelle, «USD en efectivo», «EUR en efectivo», «MN en efectivo», «Transferencia en MN»

**Status**: ✅ DONE (WU6, commit 088f19d; **Strict TDD active, 3 RED→GREEN cycles**)

## Work Units Completed

All 7 work units are DONE, marked [x] in tasks.md, verified with real commit hashes:

1. **WU1** `refactor(sales): rename ventas folder and classes to sales/order (D+E)` — commit **b435452**
2. **WU2** `feat(sales)!: rename OrderStatus/DeliveryMode/PaymentChannel values to English` — commit **df3fc7c** (absorbed WU3's literal-guard portion + 100% of WU4)
3. **WU3** `refactor(sales): rename seed constants and demo slug to English` — commit **9ec2caa**
4. **WU4** — absorbed into WU2 (no separate commit)
5. **WU5** `refactor(currency): rename convertir/resolverTasa functions to English` — commit **6d722f2**
6. **WU6** `feat(sales): add Spanish display labels for order status/delivery/payment channel` — commit **088f19d**
7. **WU7** `docs(sales): update spec and e2e fixtures to the English enum values` — commit **16b4a26**, tasks-sync **36b8f97**

## Verification Results

**Verdict**: PASS WITH WARNINGS

### Build & Tests (all run from `templates/`, all green)
- `pnpm -r build` → exit 0
- `pnpm --filter @store-mgmt/domain test` → **238/238** passed (20 suites)
- `pnpm --filter @store-mgmt/infra-db test` → **121/121** passed (18 suites, real Postgres)
- `pnpm --filter api-salesops test` → **181/181** passed (15 suites)
- `pnpm --filter api-salesops test:e2e` → **50/50** passed (6 suites)
- `pnpm --filter api-salesops lint` → exit 0, zero violations, zero `--fix` diffs

**Total**: **590/590 tests passing**, zero behavior regression, full test matrix baseline preserved.

### Naming Compliance
All 9/9 blocks (A–H plus the spec/docs sweep) independently verified:
- Enum values (schema + domain types + migrations) ✅
- Folder/class renames with zero wire impact ✅
- Seed constants + persisted slug migration ✅
- Currency function/param renames (matches `salesops-currency/spec.md` signatures) ✅
- Spanish display labels with real value-varying TDD assertions ✅
- Spec/docs literal sweep (WU7) ✅

### Warnings Addressed

**WARNING 1** (from verify-report #1550): Residue-sweep claim overstated completeness — bare word "Ventas" was never searched in WU7.

**Resolution** (commit b322407, post-verify cleanup #1552): Additional cleanup pass renamed remaining bare-word `Ventas` module references to `Sales` across 7 files:
- `templates/packages/infra-db/prisma/schema.prisma` (7 lines: 88, 120, 167, 171, 192, 193, 200)
- `templates/packages/domain/src/sales/errors.ts`
- `templates/packages/domain/src/users/errors.ts`
- `templates/packages/domain/src/customer/customer-repository.port.ts`
- `templates/packages/domain/src/product/product-repository.port.ts`
- `templates/packages/domain/src/product/commission-seam.md`
- `templates/packages/domain/src/inventory/stock-reservation-seam.md`

**Final verification** (commit b322407): `pnpm -r build` exit 0; 590/590 tests passing; lint clean. ✅

**WARNING 2** (from verify-report #1550): Strict TDD cycle evidence recorded as narrative prose instead of structured table format.

**Resolution** (ACCEPTED DEVIATION, recorded here): apply-progress #1536 documents WU6's 3 RED→GREEN cycles with specific quoted error messages and TS2741 compiler-error proof. Substance is credible (labels.test.ts 6/6, payment-channel.test.ts +2, order.service.spec.ts +1, all genuine value-varying assertions). Delivery model squashes each WU into one commit, so RED-phase claims cannot be independently re-verified via git history. This is a **protocol-format gap, not a substance failure** — flagged as accepted deviation for future process improvement.

### Explicitly Preserved (MUST-NEVER-RENAME)

The following items were intentionally left unchanged per locked decision #1529:

1. **Change Name**: `backend-ventas` — archived SDD change name (historical identity, historical record inviolate)
2. **Module Name**: `Inventario` (Inventory module) — never in scope for this rename, different module
3. **Hash Salt**: `` `ventas-seed:${key}` `` at `packages/infra-db/src/sales/seed.ts:18,24` — byte-exact, untouched, with stability comment preserved
4. **Display Strings**: `'Ventas Demo'` at `seed.ts:84` — user-facing Spanish text, locked MUST-NEVER-RENAME under block F. The sibling descriptions `'Ventas seed demo product (USD|MN)'` at `seed.ts:93,110` are NOT part of the locked inventory; verify raised them only as a cosmetic SUGGESTION (mixed Spanish/English in one string). Left unchanged for consistency with the locked line 84 — open, non-blocking.

All 4 items independently verified intact via git show / grep across the final commit.

### Out-of-Scope (Verified Not Touched)

- **`apps/salesops-mvp`** (entire prototype, 30+ files) — disconnected localStorage prototype with own richer `OrderState`, zero backend API calls, no changes
- **Applied migration files** — checksums immutable once migrated
- **`openspec/changes/archive/`** — historical SDD record, never rewritten

## Spec & Docs Status

**No delta spec and no design artifact** for this change (deliberate owner decision — pure identifier rename, zero behavior change). The authoritative capability specs were **already updated in-place during WU7** (#1534 tasks confirm this):

- **`openspec/specs/salesops-ventas/spec.md`** — ALREADY UPDATED by WU7 (66 enum-literal occurrences manually swept to English)
  - Capability slug `salesops-ventas` intentionally NOT renamed (scope: directory/title identity only)
  - Left untouched: `Inventario` (different module), pre-existing drift at line 184 (spec/code discrepancy, tracked separately)

- **`openspec/specs/salesops-currency/spec.md`** — ADDED TO WU7 SCOPE (discovered via residue sweep)
  - Updated for Currency module functions/params renamed in block G (WU5)
  - Pre-existing drift `efectivaDesde` deliberately left untouched (out of locked #1529 inventory, not silently fixed)

**No main spec merge required**: specs are current, no delta to sync. Change is ready for immediate release.

## Delivery Model & Branch State

- **Branch**: `salesops-rename-ventas` (64 commits, new remote branch)
- **Base**: cut from `salesops-users` @ 163cd7d
- **Status**: Clean working tree, **PUSHED to origin** (commit 0c50ca1, per locked delivery model)
- **PR Model**: None — single branch, work-unit commits, no pull request opened

## File Changes Summary

- **Total files affected**: ~45 files, ~490–670 changed lines
- **Blocks C+G (Currency)**: ~97 occurrences across 17 files, ~120–170 lines
- **Major sources of churn**: Test fixture literals (rate-resolver 37, e2e 29, prisma-order.repository.spec 25, order.test 22), spec/docs prose (WU7 sweep), enum migration

## Archive Contents

This change folder has been moved to `openspec/changes/archive/2026-07-27-ventas-english-rename/` with all artifacts preserved:

- ✅ `proposal.md` — owner-approved scope and approach
- ✅ `tasks.md` — 7 work units, all [x] DONE
- ✅ `verify-report.md` — PASS WITH WARNINGS (both warnings resolved/accepted)
- ✅ `archive-report.md` — this document (lineage + final closure)

**NO delta specs / design files** — these were never authored, in either backend. Deliberate owner decision for a pure identifier/label rename with zero behavior change; the contract was the LOCKED naming decisions (#1529 + amendment #1537) instead.

## Source of Truth Updated

The following specs now reflect the new English behavior and are current:

- `openspec/specs/salesops-ventas/spec.md` (enum literals + module prose, WU7)
- `openspec/specs/salesops-currency/spec.md` (function/param prose, added WU7)

Both are already merged into main specs; no further action required.

## SDD Cycle Complete

✅ Proposal: owner-approved scope + approach (naming blocks A–H)  
✅ Tasks: 7 work units structured, sequenced, all DONE  
✅ Implementation: all commits green, full test matrix passes, lint clean  
✅ Verification: PASS WITH WARNINGS, both warnings resolved/accepted  
✅ Archive: change moved to historical record, lineage persisted, ready for release

The `ventas-english-rename` SDD change is **CLOSED and ready for deployment**. No further SDD work required.

---

**Generated**: 2026-07-27 (archive phase)  
**Executed by**: sdd-archive skill  
**Artifact store mode**: hybrid  
**Next recommended**: None (change is complete)
