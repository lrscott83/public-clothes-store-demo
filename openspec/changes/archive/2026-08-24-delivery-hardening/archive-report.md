# Archive Report — delivery-hardening

**Date**: 2026-08-24
**Verdict**: ARCHIVED — amendment cycle closed.

## Verdict rationale

This was an AMENDMENT change by design: it caught
`openspec/specs/salesops-delivery/spec.md`, `openspec/specs/salesops-ventas/spec.md`,
and `openspec/specs/salesops-tenancy/spec.md` back up to code that had ALREADY shipped on
the `salesops-delivery` branch before this change existed. The code is the remediation of
the `judgment-day` blind dual adversarial review of archived `2026-08-07-delivery`
(defect classes C, D2, D3, E2, E3, F1, F2, F3, G1, G2, G3, G6, G7). Per its proposal,
`sdd-verify` for THIS change would have been a documentation-consistency check against
already-shipped code, not an implementation check; no verify-report exists BY DESIGN.
No `sdd-apply` ever ran against this change for the same reason. No CRITICAL verification
issues exist to gate the archive because no implementation verification was owed — the
audit-spec-merges tool run below is the consistency proof that WAS owed.

## Intentional lightweight shape

The change folder contained ONLY `proposal.md` + `specs/`. No design.md, tasks.md,
or verify-report.md — intentional for a spec-truth amendment with zero new
implementation work. This archive is therefore complete for its kind; nothing is missing.

## Merge record

### salesops-delivery → openspec/specs/salesops-delivery/spec.md

MODIFIED (replaced in place, matching by exact title):

1. **"DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order" → RENAMED and
   replaced wholesale with "DeliveryAssignment Is a Three-State Bridge, Zero-Or-One Per
   Order"** per the proposal's note to the archiver. The old title does not survive as a
   requirement heading anywhere in `openspec/specs/`; the merged spec keeps only the new
   title. Not merged as same-titled MODIFIED — the two titles assert contradictory enum
   cardinalities. The rename mirrors the `OperadorAlmacen Warehouse Scope` →
   `WarehouseOperator Warehouse Scope` precedent and is registered in the audit tool's
   `KNOWN_EXCEPTIONS` (see below).
2. "Carrier Catalog as Tenant Master Data" — added trim-on-create/update rules for
   name/phone; explicit statement that by-id carrier read returns soft-deleted carriers.
3. "Carrier Capacity Is Computed, Never Stored" — added the bounded throughput window
   (`DEFAULT_THROUGHPUT_WINDOW_DAYS` = 30-day default lower bound incl. to-only calls;
   upper bound deliberately left open, never defaulted to app clock), `throughputWindow`
   response echo, unbounded in_transit counts, and `from > to` 400 / `from === to` OK
   validation.
4. "Carrier Catalog Roles Mirror Existing Master Data" — documented the existing
   owner/admin role gate on coverage writes (`POST`/`DELETE
   /delivery/carriers/:id/warehouses`). Documentation-gap closure only; the code gate was
   already live.

ADDED:

5. "A Cancelled Order Never Leaves an Open Assignment Behind" (cancel-side assignment
   reconciliation inside `OrderService.cancel()`'s transaction).
6. "Delivery Assignment and Capacity Reads Are Role-Gated and Warehouse-Scoped"
   (role gating; warehouse-operator scoping via query pushdown; unknown-order-id and
   cross-warehouse both resolve to identical 403 via sentinel warehouse; capacity read
   deliberately NOT warehouse-scoped).
7. "Carrier Deactivation Is Guarded and Atomic Against Concurrent Assignment" (shared
   409 guard across PATCH active:false and soft-delete; `FOR UPDATE` serialization with
   assignment creation).
8. "Delivery Endpoints Validate Identifiers and Fail Loud, Never With a 500" (UUID
   validation → 400; unknown carrier 404; coverage declaration against inactive carrier
   404).

Also updated one stale phrase in the Purpose section ("two-state lifecycle" →
"three-state lifecycle") so the prose matches the renamed requirement.

### salesops-ventas → openspec/specs/salesops-ventas/spec.md

MODIFIED:

1. "Order Delivery Mode" — the parenthetical describing `DeliveryAssignment.status` now
   reads `(in_transit | delivered | cancelled)`; historical footnote from
   `2026-08-07-delivery` carried forward verbatim.

ADDED:

2. "Sales Transitions Take a Row Lock Before Mutating" (uniform `FOR UPDATE` first
   statement across confirm/deliver/cancel — lock-ordering-deadlock avoidance).
3. "Delivery Reads Order Scope Through a Dedicated Projection, Not the Full Aggregate"
   (`IOrderRepository.findScopeProjection`).
4. "Cancel Tolerates an Un-Migrated Tenant When No Assignment Needs Closing" (bind-
   parameter enum cast instead of plan-time literal cast).
5. "Order Actions Enforce Warehouse Scope via the Shared Domain Error"
   (`WarehouseScopeViolationError` shared with Delivery controllers).

### salesops-tenancy → openspec/specs/salesops-tenancy/spec.md

MODIFIED:

1. "Single Migration Tool With Loud Drift Detection" — added the Postgres ≥ 12 server
   version floor (explicit-transaction vs `ALTER TYPE ... ADD VALUE`).

ADDED:

2. "App Boot Gates on Tenant Schema Currency" (`assertTenantSchemasCurrent`, in-process
   pg-only probe, `TENANT_SCHEMA_DRIFT_CHECK` = enforce|warn|off, enforce default,
   probe-failure never refuses boot).
3. "A One-Shot Backfill Closes Assignments Stranded Behind Cancelled Orders"
   (report-only default, destructive flag to close to `cancelled` with NULL deliveredAt).
4. "Fleet Migration Adds Indexes for the New Warehouse and Throughput Scans"
   (`@@index([warehouseId])` on Order, `@@index([deliveredAt])` on DeliveryAssignment).

## KNOWN_EXCEPTIONS registration

`openspec/tools/audit-spec-merges.py::KNOWN_EXCEPTIONS` gained:

```python
("2026-08-07-delivery", "salesops-delivery",
 "DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order"):
    "RENAMED by delivery-hardening to 'DeliveryAssignment Is a Three-State "
    "Bridge, Zero-Or-One Per Order' — the two-state claim became false when the "
    "shipped enum gained `cancelled`. Present under the new title.",
```

This records that the OLD-titled delta requirement in the ARCHIVED `2026-08-07-delivery`
change is legitimately absent from the live contract (renamed, present under the new
title) so the auditor does not flag it as removed indefinitely.

## Audit result (post-merge)

```
Delta spec files scanned: 36
Known documented exceptions: 10

Clean — every delta requirement is accounted for in openspec/specs/.
EXIT=0
```

This closes the last 12 open audit items, all of which belonged to this change
(11 ADDED/MODIFIED-new requirements plus the renamed three-state title flagged before
merge). Baseline before merge: 12 open items, all `[OPEN] delivery-hardening`.

## Mechanical integrity

Change folder moved via `git mv` after recursive snapshot; source confirmed gone;
`diff -r` readback of snapshot vs archived folder returned EMPTY (exit 0) — byte-identical
archive, verbatim output recorded in the phase result.
