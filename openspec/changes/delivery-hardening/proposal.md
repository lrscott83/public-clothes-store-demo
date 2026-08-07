# Proposal: delivery-hardening

> This is an AMENDMENT, not a new feature change. Every behavior described below is
> ALREADY SHIPPED on this branch (`salesops-delivery`, working tree dirty with an
> approved, uncommitted remediation at authoring time). This document's only job is to
> bring `openspec/specs/salesops-delivery/spec.md`, `openspec/specs/salesops-ventas/spec.md`
> and `openspec/specs/salesops-tenancy/spec.md` — all three already PROMOTED/merged — back
> into agreement with what the code actually does. It does not plan new work and `sdd-apply`
> has nothing to do against it.

## Why this amendment exists

A blind dual adversarial review (`judgment-day`) of the archived `2026-08-07-delivery`
change found defects that `sdd-verify` passed over at archive time. The findings carry a
class taxonomy visible directly in the shipped test/doc comments (`rg -n "CLASS [A-Z][0-9]"
templates/`): **C, D2, D3, E2, E3, F1, F2, F3, G1, G2, G3, G6, G7** — each cited inline
below against the requirement it changes. Two remediation rounds shipped real behavior
changes closing them, on this same branch, not yet committed.

The sharpest defect: `openspec/specs/salesops-delivery/spec.md` currently states, as a
MUST with its own verification scenario, that `DeliveryAssignmentStatus` is **exactly two
states** (`in_transit | delivered`) — *"no third state exists"*. The shipped enum now has
**three**. That is not a documentation nit; it is a live contract asserting something the
code contradicts, which is exactly the failure class this repo's `openspec/tools/
audit-spec-merges.py` exists to catch on the MERGE side. This amendment exists to catch it
on the SPEC-TRUTH side, before the next `sdd-verify` run either wrongly fails the (correct)
code or wrongly passes the (false) spec.

## Scope

Three capabilities amended in one change, mirroring `2026-08-07-delivery`'s own precedent
of covering `salesops-delivery` + `salesops-ventas` in a single change directory:

- **`salesops-delivery`** — the third `DeliveryAssignmentStatus` state and its
  cancel-side reconciliation; role-gating and warehouse-scoping of assignment/capacity
  reads (previously "no role restriction"); a shared carrier-deactivation guard (409,
  atomic against a concurrent assignment); uuid/not-found validation that used to 500;
  a bounded throughput window alongside an intentionally unbounded in-transit count;
  and a documentation gap on the two coverage-write endpoints' existing role gate.
- **`salesops-ventas`** — a uniform `FOR UPDATE` row lock across `confirm`/`deliver`/
  `cancel` (a new concurrency contract avoiding a lock-ordering deadlock); a dedicated
  scope-projection read for the delivery gateway instead of the full aggregate; a
  cancel path that tolerates an un-migrated tenant instead of 500ing; the warehouse-scope
  403 now sharing Delivery's domain error; and the stale two-state reference to
  `DeliveryAssignment.status` in the Order Delivery Mode requirement.
- **`salesops-tenancy`** — see "Why `salesops-tenancy` is included here, not split out"
  below.

**No `sdd-apply` follows this change.** The code is already shipped and the working tree
already reflects it. `sdd-verify` for THIS change (if ever run) is a documentation
consistency check, not an implementation check — assert the delta content matches the
code, not that code was written from the delta.

### Why `salesops-tenancy` is included here, not split into its own change

Considered and rejected: a separate `tenancy-hardening` change. Kept together because:

1. **Same remediation, same branch, same commits.** All three capability deltas describe
   ONE remediation effort responding to ONE `judgment-day` review, landed together on
   `salesops-delivery`. Splitting the paperwork after the code shipped as one unit invents
   a boundary the work never had.
2. **Causally inseparable.** The tenancy items exist BECAUSE of the delivery item: the new
   `DeliveryAssignmentStatus.cancelled` enum value is what makes an un-migrated tenant's
   `POST /orders/:id/cancel` capable of 500ing (CLASS F1/F2), which is what motivates the
   boot-time schema-currency gate and the one-shot stranded-assignment backfill (CLASS
   F3). A `salesops-tenancy`-only delta would need to forward-reference a capability it
   doesn't own to explain why it exists.
3. **Precedent.** `2026-08-07-delivery` itself amended `salesops-ventas` from inside the
   `salesops-delivery`-titled change for the identical reason — the amendment target was
   determined by WHAT changed, not by which capability directory felt tidiest.

## Corrections to the owner's brief (verified against code, not taken on faith)

Per instruction, every claim was checked directly against
`templates/apps/api-salesops/src/delivery/**`, `templates/packages/domain/src/delivery/**`
and `templates/packages/infra-db/src/delivery/**` before being written into the spec deltas
below. One item did not match:

- **"the coverage WRITE endpoints ... have no requirement covering them at all"** — read
  literally as a CODE claim (no `@Roles` guard), this is FALSE: `carrier.controller.ts`
  applies `@Roles(USER_ROLES.owner, USER_ROLES.admin)` to both `POST` and
  `DELETE /delivery/carriers/:id/warehouses`, identical to every other carrier write. Read
  as the SPEC claim it actually was ("no *requirement* covers them" — i.e. `spec.md` never
  documents this role gate), it is TRUE: the "Carrier Catalog Roles Mirror Existing Master
  Data" requirement enumerates `create`/`update`/soft-`delete` and the two assignment
  operations, but never mentions the coverage endpoints. The delta below closes the
  documentation gap, not a code gap — no code changes are implied or required.

Everything else in the brief was verified accurate against the current working tree,
file:line evidence recorded in the delta requirements below.

## What this amendment does NOT do

- Does not touch `openspec/specs/salesops-delivery/spec.md`,
  `openspec/specs/salesops-ventas/spec.md`, or `openspec/specs/salesops-tenancy/spec.md`
  directly — those are merge targets, mutated only by `sdd-archive`.
- Does not add, remove, or modify any code. The remediation is already shipped; this
  document is paperwork catching up to it.
- Does not re-litigate any decision from `2026-08-07-delivery`'s `proposal.md`/`design.md`
  (D1–D8) — none of them are reversed. `DeliveryAssignmentStatus` gaining `cancelled` is
  additive to D3's two states, not a reopening of it; D3's rationale (no "assigned but not
  picked up" phase) still holds for the in-flight lifecycle, `cancelled` is a terminal
  administrative outcome layered on top.

## Merge targets

| Capability | Merge target | Kind |
|---|---|---|
| `salesops-delivery` | `openspec/specs/salesops-delivery/spec.md` | MODIFIED + ADDED requirements |
| `salesops-ventas` | `openspec/specs/salesops-ventas/spec.md` | MODIFIED + ADDED requirements |
| `salesops-tenancy` | `openspec/specs/salesops-tenancy/spec.md` | MODIFIED + ADDED requirements |

## Note for whoever runs `sdd-archive`

The "DeliveryAssignment Is a Two-State Bridge, Zero-Or-One Per Order" requirement is
RENAMED in this delta to "DeliveryAssignment Is a Three-State Bridge, Zero-Or-One Per
Order" — the old title is now a false statement, not a stale-but-harmless one, mirroring
why `OperadorAlmacen Warehouse Scope` → `WarehouseOperator Warehouse Scope` was renamed
rather than left standing. When merging, this needs the SAME treatment
`openspec/tools/audit-spec-merges.py` already gives that precedent: either the merged spec
keeps only the new title (rename in place, no duplicate old-titled requirement left behind),
or, if the merge tooling matches by title, a `KNOWN_EXCEPTIONS` entry recording the rename
so the audit does not flag the old title as "removed" indefinitely. Do not merge this as a
same-titled MODIFIED — the two titles describe contradictory claims and only one may exist
in `openspec/specs/` afterward.
