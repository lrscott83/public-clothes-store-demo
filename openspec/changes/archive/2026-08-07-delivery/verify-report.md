# Verify Report — delivery

**Verdict: PASS WITH WARNINGS** — CRITICAL: 0, WARNING: 1 (CLOSED), SUGGESTION: 2 (CLOSED)

> **All findings resolved 2026-08-07. Nothing is left open on this change.**
>
> - **WARNING — `activeOnly` port/adapter doc drift: CLOSED.** The port's doc comment
>   at `packages/domain/src/delivery/carrier-repository.port.ts` now matches the adapter
>   and the tests. One correction to this report's framing, established while fixing it:
>   the report treated this purely as documentation drift, which is right, but did not
>   check the consumers. Verified — `DeliveryService.listCarriers` and
>   `getCarrierCapacity` both pass `activeOnly: true` explicitly, so **no endpoint ever
>   exposed a soft-deleted carrier**; there was never a behavioural leak. The comment
>   additionally now records the inverted sense relative to `IWarehouseRepository`'s
>   `includeInactive` (default EXCLUDES inactive), a divergence this report did not
>   mention and which is the likelier future trap.
> - **SUGGESTION 1 — stale `design.md` §10 close-ordering diagram: CLOSED.** §10 now
>   opens with an amendment note stating the shipped code runs the close FIRST, why
>   (testability of the rollback path), and that all three ADR MUSTs still hold. The
>   diagram is left as written; the record is annotated, not rewritten.
> - **SUGGESTION 2 — `seedCarriers` unwired: CLOSED.** Recorded in the seed file's own
>   doc comment as a deliberate choice with its reason, so the omission cannot be
>   rediscovered later as a bug.

Independent re-derivation. Phase 7 (the change's own cross-cutting check) is
NOT relied on as evidence — every claim below was re-run or re-inspected in
this session, at commit `1a6476c` (branch `salesops-delivery`, pushed,
`origin/salesops-delivery` at the same commit, working tree clean, verified
directly via `git status --porcelain`, `git branch -vv`, `git log`).

## Test evidence (executed in this session, real output)

| Package | Command | Result |
|---|---|---|
| `packages/domain` | `pnpm test` (vitest) | **30 files / 314 tests, all passed** |
| `packages/infra-db` | `pnpm test` (jest, real Postgres, `maxWorkers:1`) | **41 suites / 327 tests, all passed** (46.4s) |
| `apps/api-salesops` unit | `pnpm test` (after `pnpm --filter @store-mgmt/domain build` + `pnpm --filter @store-mgmt/infra-db build`) | **25 suites / 373 tests, all passed** |
| `apps/api-salesops` e2e | `pnpm test:e2e` | **9 suites / 87 tests, all passed** (ERROR log lines are expected negative-path assertions, not failures) |
| `pnpm -r build` (repo root) | full monorepo build | **clean**, no errors |
| lint (domain, infra-db, api-salesops) | `pnpm lint` (`--fix --max-warnings 0`) | **clean**, zero warnings, zero `--fix` diffs (`git status --porcelain` empty afterward) |

These numbers match tasks.md's Phase 7 claims exactly (domain 314, infra-db
327, api-salesops unit 373, e2e 87) — independently reproduced, not replayed.

## Design invariants — independently checked, all 13 hold

1. **Tenant-only tables.** `rg` confirms `Carrier`/`CarrierWarehouse`/`DeliveryAssignment`/`DeliveryAssignmentStatus` exist only in `packages/infra-db/prisma/tenant/schema.prisma:544-604`; zero matches in `master/schema.prisma`. HOLDS.
2. **Order gained no columns beyond the inverse relation; `OrderStatus` unchanged.** `schema.prisma:248-253` — `OrderStatus` still `created|verified|delivered|cancelled` (4 values). `Order` model diff (`git diff d755713..HEAD`) shows only `deliveryAssignment DeliveryAssignment?` added, comment-pinned to the Delivery module. HOLDS.
3. **No `markDelivered` on `IDeliveryAssignmentRepository`.** Read `delivery-assignment-repository.port.ts:1-30` — absent, with an explicit doc comment stating the absence is deliberate. HOLDS.
4. **`ordersAwaitingCarrier` lives on `IDeliveryAssignmentRepository`, not `IOrderRepository`.** Confirmed `countOrdersAwaitingCarrier()` on the delivery port; `git diff d755713..HEAD -- .../sales/order-repository.port.ts` shows only a doc-comment addition to `deliver()` — `OrderListFilter` untouched. HOLDS.
5. **Capacity computed, never stored.** Read `compute-carrier-capacity.ts` — pure function, no DB/query import, no `capacity` column in schema. HOLDS.
6. **Gateway delegates to `OrderService.deliver()`, not `IOrderRepository.deliver()`.** Read `order-delivery-gateway.adapter.ts:37-38` — calls `this.orderService.deliver(orderId)`; `IOrderRepository` injected only for a post-write `findById` read. HOLDS.
7. **`closeAssignmentOnDeliveryTx` inside `deliver()`'s transaction, not swallowed.** Read `prisma-order.repository.ts:377-424` — runs inside `$transaction`, no try/catch around it (a throw here aborts the whole transaction). Commission accrual call (`order.service.ts:314-329`) confirmed unchanged: still after the transaction returns, still in its own try/catch. HOLDS.
8. **0 rows affected is not an error.** `close-assignment-on-delivery.ts` is a guarded `UPDATE ... WHERE ... AND status='in_transit'`, never `findUniqueOrThrow`; covered by a dedicated infra-db spec (`prisma-order.repository.spec.ts:479-500`, "0 rows is not an error"). HOLDS.
9. **Phase 5's 3 mitigations shipped together in `e175926`.** `git show e175926 --stat` confirms `order-repository.port.ts` (doc comment), `delivery-assignment-seam.md` (new file), and `backend-boundaries.config.js` (eslint rule) all landed in that one commit. **Independently re-proved the eslint rule fires**: added `import { DeliveryModule } from '../delivery/delivery.module.js'` to `order.service.ts`, ran `eslint src/sales/order.service.ts --max-warnings 0` → exit code **1**, `no-restricted-imports` warning citing the exact boundary message. Reverted; `git diff --stat` on the file was empty; re-ran lint clean. HOLDS.
10. **Coverage is advisory.** `delivery-assignment.controller.spec.ts:218-228` asserts 201 + `response.body` has no `warning` property on a coverage mismatch. `delivery.service.spec.ts:331+` asserts success with zero coverage rows. `assign()` never takes a `warehouseId` param — structurally cannot check coverage. HOLDS.
11. **Zero `CarrierWarehouse` rows = not offered anywhere.** Spec (`salesops-delivery/spec.md:73-79`) states this explicitly; `delivery.service.spec.ts:125-134` asserts `coversWarehouse:false` for a freshly-created carrier with zero rows, still listed. HOLDS.
12. **No NestJS cycle.** Read `delivery.module.ts` (`imports: [InfraDbModule, SalesModule]`) and `sales.module.ts` (`exports: [ORDER_DELIVERY_GATEWAY]` only). `rg "from '.*delivery"` inside `apps/api-salesops/src/sales/` matches only the adapter's own local file (`./order-delivery-gateway.adapter.js`) — no import of `DeliveryModule` or anything under the app-level `delivery/` folder. HOLDS.
13. **`salesops-ventas` amendment is correct.** Read the full delta — it replaces the false "inserts despachando/transportando" claim and the stale "(Delivery module not yet built)" premise with prose matching the shipped D5/D6 mechanism, and updates the corresponding scenario. `rg -i "despachando|transportando"` across `packages/` and `apps/api-salesops/` returns exactly 3 hits, all negative assertions (Sales' own comment stating it never models them, plus a rejection test). This is a delta ready for `sdd-archive` to merge — merging itself is out of this phase's scope, correctly not attempted here. HOLDS.

## Findings

### WARNING (1)

**Port doc comment on `activeOnly` still contradicts the shipped behavior.**
`packages/domain/src/delivery/carrier-repository.port.ts:5` reads: *"When
omitted or `false`, `active: false` carriers are excluded (default
listing)."* Read literally, that means the DEFAULT is active-only filtering.
The shipped adapter (`prisma-carrier.repository.ts:85-89`) implements the
OPPOSITE: `filter?.activeOnly === true ? {active:true} : {}` — omitted/false
returns EVERY carrier, active or not; only an explicit `true` filters. The
adapter's own doc comment (lines 38-43) acknowledges the ambiguity and states
its chosen reading, but the port itself — architecture.md's stated single
source of truth ("Port... states WHAT the domain needs... the domain imports
the interface, never the implementation") — was never corrected to match.
No spec scenario pins the behavior either way, so nothing is spec-violating,
and the ambiguity is flagged in-repo, not hidden. But a port whose own doc
comment describes behavior opposite to its only real implementation is a
live trap for the next contributor who reads the port and not the adapter.
**Recommendation**: update the port's doc comment (one line) to match the
adapter's actual behavior, or add a spec scenario that pins the semantics so
future adapters can't diverge either way. Not CRITICAL — single adapter,
single call site, already covered by tests either way; no downstream code
depends on the wrong reading.

### SUGGESTION (2)

1. **design.md §10's data-flow diagram is now stale on ordering.** The
   diagram shows `closeAssignmentOnDeliveryTx` running LAST, after the stock
   effects; the shipped code (`prisma-order.repository.ts:392-399`) runs it
   FIRST, for a documented and sound reason (keeps the rollback test's
   failure injection clean; statement order inside one atomic transaction
   has no effect on the all-or-nothing outcome, and no locked ADR pins the
   order). The reasoning holds and no requirement is violated — but the
   design doc itself was never updated to reflect the actual shipped order,
   so a future reader comparing design.md to code will see a mismatch with
   no pointer back to the code comment that explains it. Low-cost fix:
   amend the §10 diagram or add a one-line note pointing at the deviation.

2. **`seedCarriers` is tested/idempotent but intentionally unwired from
   `prisma/seed.js`.** Assessed as correct restraint, not a gap: no task in
   `tasks.md` called for the wiring, and `proposal.md`'s Non-Goals section
   explicitly scopes "Wiring `apps/salesops-mvp` to the real API" (which
   includes replacing the seed) as a separate, pending-for-every-module
   effort with its own auth precondition. Shipping a tested, available,
   unwired seed function is the right amount of restraint here — flagging
   only so it isn't silently forgotten when that future wiring effort
   starts.

### Assessed, no action needed

- **The rollback test's companion assertions (order still `verified`, stock
  untouched) were not independently RED**, as apply flagged. Re-derived: since
  `closeAssignmentOnDeliveryTx` runs FIRST and the induced failure happens
  AFTER it, an assignment that was NEVER wired at all would ALSO end up
  `in_transit` after the forced failure — so this test alone cannot
  discriminate "no wiring" from "correct atomic wiring." What it DOES
  discriminate is "wiring present but not atomic" (e.g. a future refactor
  that runs the close outside `deliver()`'s transaction) from "wiring
  present and atomic" — in the non-atomic case the assignment would show
  `delivered` even after the outer failure, because that write would have
  already committed on its own. Combined with the separate happy-path test
  (`prisma-order.repository.spec.ts:447`, independently RED per task 5.3),
  which DOES prove the wiring exists, the pairing is adequate: existence is
  proven by one test, atomicity-under-failure by the other. No gap.

## Architecture conformance

Matches `docs/system/architecture.md`'s "Where does X go?" table exactly:
domain entities/ports/pure functions in `packages/domain/src/delivery/`
(confirmed zero infra/framework imports via `rg`), adapters in
`packages/infra-db/src/delivery/`, thin NestJS delivery in
`apps/api-salesops/src/delivery/`, the D6 gateway adapter correctly placed in
Sales' own app folder (not Delivery's), and the new cross-module boundary
rule added to `packages/eslint-config` rather than left as a doc-only
convention. `Warehouse` gained the mirrored inverse relation
(`carriers CarrierWarehouse[]`, `schema.prisma:146`). Dependency direction
holds: `apps → packages → domain`, and within apps, `DeliveryModule → SalesModule`
one-way only.

## Completeness

All items in `tasks.md` (Phases 0-7) are marked `[x]`; `rg -n "^\- \[ \]"`
against the file returns zero unchecked boxes. Spot-checked task claims
against source for Phases 1, 2, 5, 6a, 6b, 7 — every cited file:line and
test-count claim reproduced accurately in this session (see Test evidence
table and the 13-invariant table above). No task was found checked off
without corresponding implementation.

## Spec conformance

Every requirement and scenario in `salesops-delivery/spec.md` maps to a
passing test cited above (Carrier Catalog, Coverage join table, two-state
DeliveryAssignment, Computed Capacity, Sales-owns-status, unrestricted
`/deliver`, no-orphaned-assignment reconciliation, advisory coverage, role
mirroring). The `salesops-ventas` amendment correctly supersedes the shipped
spec's false claim without leaving a contradiction standing (invariant 13).
