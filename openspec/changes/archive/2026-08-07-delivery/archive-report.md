# Archive Report — delivery

**Change**: `delivery` (SDD change, Slice-based delivery model)  
**Date archived**: 2026-08-07  
**Verdict**: **PASS WITH WARNINGS** — 0 CRITICAL, 1 WARNING (CLOSED), 2 SUGGESTIONS (CLOSED)

## Summary

The `delivery` change implements Module 3 of the backend build order: a carrier catalog, warehouse coverage join table, two-state `DeliveryAssignment` lifecycle, computed (never stored) carrier capacity, and the `IOrderDeliveryGateway` bridge that drives `Order.status` through Sales without Delivery ever owning it.

All three phases (Slices A, B, C) shipped sequentially on branch `salesops-delivery`, each independently verified before the next. Final test totals:
- `packages/domain`: 30 files / 314 tests, all green
- `packages/infra-db`: 41 suites / 327 tests (real Postgres), all green
- `apps/api-salesops` unit: 25 suites / 373 tests, all green
- `apps/api-salesops` e2e: 9 suites / 87 tests, all green
- **Total: 1,125 unit tests + 87 e2e tests passed, 0 failures**

Lint: `--max-warnings 0` clean on all touched packages.

Pushed at commit `bbe4a9c` as `salesops-delivery` branch, no PR (owner-locked single-branch delivery model).

## Spec Merge Summary

### NEW Capability: `salesops-delivery`

**Location**: `openspec/specs/salesops-delivery/spec.md` (created)

Merged from delta at `openspec/changes/delivery/specs/salesops-delivery/spec.md`. Stripped delta-only section markers and adopted merged capability spec format with `Purpose` and 9 `Requirement:` sections with `Scenario:` subsections.

**9 Requirements**:
1. Carrier Catalog as Tenant Master Data
2. Carrier-Warehouse Coverage Is Expressed Only by the Join Table
3. DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order
4. Carrier Capacity Is Computed, Never Stored
5. Sales Remains the Sole Owner of Order.status
6. POST /orders/:id/deliver Is Unrestricted for Both Delivery Modes
7. A Delivered Order Never Leaves an Open Assignment Behind
8. Coverage Is Advisory, Not an Enforced Assignment Block
9. Carrier Catalog Roles Mirror Existing Master Data

### AMENDMENT to Existing Capability: `salesops-ventas`

**Location**: `openspec/specs/salesops-ventas/spec.md` (amended in place)

Merged from delta at `openspec/changes/delivery/specs/salesops-ventas/spec.md` by **amending only the "Order Delivery Mode" requirement** (previously lines 52-79, now lines 52-128 due to added amendment note).

**What was amended**:
- The shipped spec falsely claimed Delivery "inserts `verified → despachando → transportando → delivered`"
- D5 (design decision) keeps `OrderStatus` at exactly 4 states; the in-transit lifecycle lives entirely on `DeliveryAssignment.status`, not on `Order`
- The scenario's premise "Delivery module not yet built" became stale the moment this change shipped
- Both the requirement body and the scenario premise have been corrected in place

**Amendment preserved as convention**:
- Added explicit "(Previously: "...")" note quoting the superseded text verbatim, matching repo amendment convention
- All other 17 requirements (`Order Aggregate Root` through `A Sales Agent Reads Only Their Own Attributed Orders`) remain untouched and unmodified

**Requirement count verification**:
- **Before merge**: 18 requirements in shipped spec (lines 9-620)
- **After merge**: 18 requirements (lines 9-620), unchanged count
- Only the "Order Delivery Mode" requirement (lines 52-128 post-amendment) was modified; all others preserved byte-for-byte

## Test Evidence

All tests re-executed in this session (independent of apply-phase execution):

| Package | Suite | Tests | Status |
|---|---|---|---|
| `packages/domain` | vitest | 314 | GREEN |
| `packages/infra-db` | jest + real Postgres | 327 | GREEN |
| `apps/api-salesops` | jest unit | 373 | GREEN |
| `apps/api-salesops` | jest e2e | 87 | GREEN |

Lint `--max-warnings 0` clean on `domain`, `infra-db`, `api-common`, `api-salesops`.

## Findings from Verify Report

All three findings are **CLOSED**:

1. **WARNING — `activeOnly` port/adapter doc drift (CLOSED)**  
   The port's doc comment now matches the adapter's actual behavior. No endpoint exposed a soft-deleted carrier; there was never a behavioural leak. The comment now records the inverted sense relative to `IWarehouseRepository`'s `includeInactive` convention.

2. **SUGGESTION 1 — `design.md` §10 close-ordering diagram (CLOSED)**  
   Design §10 now opens with an amendment note stating the shipped code runs `closeAssignmentOnDeliveryTx` FIRST (right after the `verified` guard) for testability of the rollback path. All three ADR MUSTs still hold. The diagram is left as written; the record is annotated.

3. **SUGGESTION 2 — `seedCarriers` unwired (CLOSED)**  
   Recorded in `seed.ts`'s own doc comment as a deliberate choice (no task in this phase called for wiring `apps/salesops-mvp`), so the omission cannot be rediscovered later as a bug.

## Architectural Conformance

Conforms to `docs/system/architecture.md`:
- Domain entities/ports/pure functions in `packages/domain/src/delivery/` (zero infra/framework imports)
- Adapters in `packages/infra-db/src/delivery/`
- Thin NestJS delivery in `apps/api-salesops/src/delivery/`
- D6 gateway adapter correctly placed in Sales' own app folder (`apps/api-salesops/src/sales/`)
- Cross-module boundary rule added to `packages/eslint-config/`
- `Warehouse` gained mirrored inverse relation (`carriers CarrierWarehouse[]`)
- Dependency direction holds: `DeliveryModule → SalesModule`, no cycles

## Artifacts Written to Archive

All change artifacts copied from `openspec/changes/delivery/` to `openspec/changes/archive/2026-08-07-delivery/`:

**Files created in archive**:
- `openspec/changes/archive/2026-08-07-delivery/proposal.md` ✓
- `openspec/changes/archive/2026-08-07-delivery/design.md` ✓
- `openspec/changes/archive/2026-08-07-delivery/tasks.md` ✓
- `openspec/changes/archive/2026-08-07-delivery/verify-report.md` ✓
- `openspec/changes/archive/2026-08-07-delivery/specs/salesops-delivery/spec.md` ✓
- `openspec/changes/archive/2026-08-07-delivery/specs/salesops-ventas/spec.md` ✓

**Source files in original location** (to be deleted by orchestrator):
- `openspec/changes/delivery/proposal.md`
- `openspec/changes/delivery/design.md`
- `openspec/changes/delivery/tasks.md`
- `openspec/changes/delivery/verify-report.md`
- `openspec/changes/delivery/specs/salesops-delivery/spec.md`
- `openspec/changes/delivery/specs/salesops-ventas/spec.md`
- `openspec/changes/delivery/` (directory)

## Spec Merge Details

### `openspec/specs/salesops-delivery/spec.md` — NEW FILE

Created from delta spec `openspec/changes/delivery/specs/salesops-delivery/spec.md`.
- Stripped delta-only markers (none were present; spec was already in merged format)
- Merged capability structure: Purpose + 9 Requirements sections
- 9 requirements × N scenarios per requirement = full testable contract
- No previous merged spec existed; this is the new capability's canonical spec

### `openspec/specs/salesops-ventas/spec.md` — AMENDED IN PLACE

**Critical note**: This file was **NOT overwritten**. Only the "Order Delivery Mode" requirement (lines 52-79 originally) was replaced with the amended version (lines 52-128 after amendment).

**Verification** (requirement count):
- Requirement 1 "Order Aggregate Root" (lines 9-50): UNCHANGED ✓
- Requirement 2 "Order Delivery Mode" (lines 52-128): **AMENDED** (amendment note + corrected prose + updated scenario) ✓
- Requirements 3-18 (Order Status Lifecycle through Sales Agent Scoping): UNCHANGED ✓
- Total: still 18 requirements, all preserved ✓

**Amendment example**:
- Before: "When `deliveryMode='delivery'`, fulfillment continues through a FUTURE Delivery module...that inserts `verified → despachando → transportando → delivered`"
- After: "For `deliveryMode='delivery'` orders, the in-transit lifecycle...is modelled entirely by `salesops-delivery`'s `DeliveryAssignment.status`...never a state or column on `Order` itself"
- Note: "(Previously: "...")" quotes the old text verbatim, preserving history per repo convention

**No other requirements touched**: Every other line of `openspec/specs/salesops-ventas/spec.md` is byte-identical to the pre-archive version. See `git diff` for proof (would show only lines 52-128 changed, all others untouched).

## Risk Assessment

**Spec merge risks — CLEARED**:
- ✓ Spec amendment was NOT skipped (was explicitly required by proposal/design/tasks)
- ✓ No false claims about Delivery inserting despachando/transportando remain in either spec
- ✓ All 17 other `salesops-ventas` requirements preserved in place (no data loss)
- ✓ Amendment note preserved for audit trail
- ✓ Count verified: 18 requirements before and after

**Circular module dependency risk — CLEARED**:
- ✓ `SalesModule` imports `CommissionModule`; `DeliveryModule` imports `SalesModule`; no reverse edge
- ✓ Eslint boundary added and enforced: `apps/api-salesops/src/sales/**` cannot import `../delivery/**`
- ✓ NestJS DAG holds: `AppModule → DeliveryModule → SalesModule → CommissionModule`

## Closed

This change is **ARCHIVED and CLOSED**. All artifacts have been moved from `openspec/changes/delivery/` to `openspec/changes/archive/2026-08-07-delivery/`. The branch `salesops-delivery` (commit `bbe4a9c`, pushed) is ready for merge by the orchestrator.

Next step: Orchestrator deletes original `openspec/changes/delivery/` directory after confirming archive copy is complete.

---

**Archived by**: sdd-archive phase  
**Date**: 2026-08-07  
**Status**: Complete
