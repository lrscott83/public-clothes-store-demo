# multi-tenant-by-schema — decisions

**Updated 2026-08-03.** The owner resolved the blocking set. What follows records each decision,
the evidence behind it, and — for the two that were withdrawn — why the question was wrong.

Artifact store: **hybrid** (this file + engram). Branch `salesops-multi-tenant-by-schema`,
pushed through `5316aa9`.

| Commit | What |
|---|---|
| `b80df29` | `company-isolation` exploration |
| `90dd42a` | that change superseded — target is schema-per-tenant |
| `7bd98fb` | `multi-tenant-by-schema` exploration, read from poolops-biz |
| `29908fd` | the open questions answered from code, second pass |
| `f7d4205` | thirteen decisions handed off, none taken |
| `50a90fe` | the blocking question retired — its premise was never true |
| `22cee4c` | proposal |
| `7c01f53` | P12 investigated — what tenant schemas cost the suite |
| `86c4b55` | design — D1–D7 |
| `c9935f1` | delta specs across six capabilities |
| `5316aa9` | eighteen work-unit commits planned |

Artifacts: [`explore.md`](./explore.md) (section 6 holds the verified answers with `file:line`),
engram `sdd/multi-tenant-by-schema/explore` (#1562), `reference/poolops-tenancy-verified` (#1779),
`reference/poolops-cutover-precedent` (#1787).

---

## The premise correction that reshaped this document

**There is no production.** The owner stated it plainly on 2026-08-03: *"estamos haciendo esto y
la app no esta funcionando ni en produccion aun."*

The previous version of this file asserted the opposite — "store-mgmt has one real company's
production data to preserve" — and built its top-priority blocking question on it. That assertion
was never verified. P13, twenty lines below it, admitted as much and asked for the check that was
never run. A blocking question was allowed to rest on an unconfirmed precondition.

Verified since: [`prisma/seed.js`](../../../templates/packages/infra-db/prisma/seed.js) is a single
idempotent entrypoint covering categories + products (from `catalog.json`), warehouses, cockpit
users and demo customers, with `company/seed.ts` and `commission/seed.ts` alongside. Every row is
reproducible. Nothing needs preserving.

**Consequence**: store-mgmt is now in exactly the condition poolops declared when it chose its own
cutover — `specs/045-schema-per-tenant/spec.md:182`, *"No production data exists yet."* Its
documented answer therefore applies to us verbatim, where before it did not.

---

## Locked by the owner

1. **Tenancy shape: schema-per-tenant**, mirroring `poolops-biz`. Row-level `companyId` was
   considered and rejected. (2026-08-02)
2. **Several companies are coming.** This expired the 2026-07-28 deferral.
3. **Follow poolops — minus its six verified landmines.** (2026-08-03) The owner's instruction was
   to reuse the sibling rather than re-derive. Adopted, with the exclusions named in P3/P4/P5/P6/P9
   below, each of which is a defect poolops's own team documented and did not fix.
4. **No cutover.** Drop and recreate from seed. (2026-08-03, follows from the premise correction.)

---

## Withdrawn — the question was wrong

### P1 — ~~How much locked downtime is acceptable for the cutover?~~ **WITHDRAWN**

There is no cutover. With no production data, the migration is: create the tenant schema, apply the
tenant DDL, re-run the seed. No `ALTER TABLE … SET SCHEMA`, no exclusive locks, no coordinated
window, no dual-write phase.

This also removes the design's entire cutover section and the tasks that would have staged it.

**Note on the earlier claim.** It was said that "poolops has NO cutover precedent." That was too
strong, and the owner caught it. poolops *does* create schemas —
`packages/infra-db/src/tenant/tenant-database.service.ts:28-52`, `createSchema()` runs
`CREATE SCHEMA IF NOT EXISTS` → `SET search_path` → applies `tenant-schema.sql`, with
`deleteSchema()`, `schemaExists()` and a UUID-validating `schemaNameForCompany()` beside it. That
code is live and we copy it for **provisioning**. What it does not do is move pre-existing rows,
which is what P1 was asking about — and poolops answered that separately, destructively, and in
writing (`spec.md:177`, `spec.md:159`, `tasks.md:216`, `checklists/requirements.md:37`). With the
premise corrected, that destructive answer is simply the right one for us too.

### P13 — ~~Verify the live `Company` row count~~ **WITHDRAWN**

Nothing to preserve, so nothing to count.

---

## Resolved

### P2 — Collapse `CompanyUser` to the master user id — **YES, as sole PK**

**Evidence.** poolops: `CompanyUser.id` IS the master `User.id` (`tenant/schema.prisma:246-247`);
`findByUserId` is `return this.findById(userId)` (`company-user.repository.ts:77-79`). Zero hops.
store-mgmt today carries a separate `id` plus a `userId` soft-FK; the 2026-07-28 D1 called the
current shape "poolops's verified shape", which is **not accurate** — the principle matches, the
columns do not.

**Decision.** Adopt the collapsed shape, and go one better: the master user id is the SOLE primary
key. poolops lets `CompanyCustomer.id` and `companyUserId` diverge, with only convention forcing
them equal at every `create()` — a foot-gun we do not inherit.

**Now nearly free**: no data to migrate behind the FK change.

### P3 — Per-tenant pool factory — **copy the shape, bound it**

**Evidence.** Each pool takes pg's default of **10** (no `max` passed,
`tenant-prisma-factory.ts:49-52`). The cache is a `Map` with no eviction, TTL or LRU.
`disposeClient()` has **zero call sites repo-wide** — only `disposeAll()`, from CLI scripts and
process-exit paths, never from a running server. One instance holds `(N+1)×10` connections against
a cluster left at Postgres's default of 100.

**Decision.** Copy the factory's shape; set an explicit pool `max`; wire real disposal. Record
spec 045's single-shared-client target as a known future step. Do not build it now, do not chase it.

**Refinement (2026-08-03).** It was previously reported that spec 045 "was never shipped, 0/40 tasks
checked." The unchecked boxes are real but misleading — **the schema-per-tenant part is live**
(`tenant-database.service.ts` does `CREATE SCHEMA`, and `tenant-prisma-factory.ts:51` passes
`options: -c search_path="<schema>",public`). What was not shipped is the pool consolidation:
`tenant-schema-runner.ts` (T009) does not exist in `src/tenant/`, so there is no shared client and
no `SET LOCAL search_path`. The landmine stands; its framing was wrong.

Lesson recorded: unchecked task boxes in that repo do not mean unshipped code. Verify against
`src/`, same as the stale README and `.env.example`.

### P4 — One migration tool, with a timeout and a drift check — **YES**

**Evidence.** poolops has TWO: `tenant-deploy-all.ts` (`migrate deploy` per tenant) and
`migrate-all-tenants.ts` (`prisma db push --accept-data-loss`), with nothing saying which is
authoritative. Neither uses a transaction. `pushSchema()` shells `execSync` per tenant with **no
timeout**, so one hung migration blocks the batch. **No drift detection anywhere** — zero hits for
`drift`, `migrate status`, `_prisma_migrations`.

**Decision.** One tool. A timeout per tenant. A drift check that fails loudly when a tenant is
behind. A fleet in mixed states that nothing reports is found months later, by a bug.

### P5 — Write the cross-schema isolation test as new work — **YES, as a deliverable**

**Evidence.** Nothing in poolops proves isolation. `concurrent-isolation.test.ts` is unshipped task
T031 of Draft spec 045. No test anywhere uses two tenant schemas in one run. Its e2e suite stubs
BOTH `JwtAuthGuard` and `TenantContextGuard` via `overrideGuard` against one hardcoded schema, so
the real guard is never exercised end to end.

**Decision.** This is the change's proof obligation, budgeted as a deliverable, not a chore. It must
appear in `tasks.md` explicitly or it will not get written. Without it, "isolated" is an assertion.

### P6 — Tenant resolution in `packages/api-common/src/auth/` — **YES, with the re-scoping pattern**

**Evidence.** poolops puts `TenantContextGuard` in `packages/api-common/src/guards/`, after
`JwtAuthGuard`. store-mgmt's own D4 precedent put role resolution in `JwtStrategy` — the same tier.

**Decision.** Guard in `auth/`, matching D4 rather than poolops's `guards/`. Adopt the re-scoping
pattern deliberately: the guard's comment claims its `AsyncLocalStorage` scope is long-lived across
the request, but that is **stale** — 100+ downstream call sites re-open their own scope from
`request.company`. Re-scoping is the more robust pattern because ALS may not survive NestJS's
RxJS/interceptor pipeline. **Write down WHY**, so nobody later "optimizes" it back.

### P7 — Reshape `Customer` / `WarehouseOperator` in this change — **YES**

**Evidence.** Both hold real Prisma `@relation` FKs to master `User` (`schema.prisma:192, :509`).
Prisma **forbids** a relation across separate schema files, so these cannot survive the split —
tooling-enforced, not a preference. poolops's answer is the id-collapse of P2.

**Decision.** In this change. A half-split schema is harder to reason about than either end state.

**Now nearly free**: schema change plus a reseed, with no data migration behind it.

### P8 — Master templates copied per tenant for the catalog — **YES**

**Evidence.** poolops keeps admin-editable `Template*` tables in master and, at company creation,
**copies** them into the new tenant's own tables (`CompanyDefaultsSeeder.seedNewCompany`). Nothing
is shared at runtime; every tenant's rows are physically its own.

This settles the question that dogged the superseded `company-isolation` change — "is the catalog
global or company-private?" Neither: templated centrally, owned per tenant.

**Decision.** Adopt for `Product`/`Category`. A new company gets a working catalog on day one
without coupling it to anyone else's edits.

### P9 — Seed synchronously, not fire-and-forget — **YES**

**Evidence.** poolops's catalog seed is deliberately `void this.seedNewCompany(...)` after the 201
already returned, because awaiting it pushed request latency past client timeouts. The consequence
is a real window where a brand-new tenant has a working owner account and **zero** catalog data.

**Decision.** Do not inherit this implicitly. Seed synchronously — store-mgmt's catalog is smaller
than poolops's. If it ever gets slow enough to matter, make the incomplete state explicit in the
API rather than silent. A company that logs in to an empty catalog reads it as a bug.

### P10 — Introduce master `Membership`, active flag in ONE place — **YES**

**Evidence.** The 2026-07-28 D3 predicted the split: `status` → master `Membership`, `role` →
tenant `CompanyUser`, withholding `Membership` so the future change would be "a clean field
extraction, not a redesign". poolops does exactly that — with one nuance: its `CompanyUser` ALSO
carries `isActive`, so "is this person active in this company" lives in **two places**, kept in
sync by hand.

**Decision.** Introduce `Membership` as D3 planned. Do NOT duplicate the active flag. One home for
that fact. poolops's two-place version is drift waiting to happen.

### P11 — `api-idp` owns the provisioning saga — **YES, with orphan detection**

**Evidence.** poolops duplicates `CompanyService.createCompany` across THREE apps because it has
three front doors and no identity app. store-mgmt has `api-idp`, which already owns User, Company,
CompanyUser and the token tables end to end via ports.

The saga: create master Company → create schema → set `schemaName` → create Membership → create
tenant CompanyUser → seed. With compensating rollback. **poolops's compensation only logs when a
rollback step itself fails** — no retry, no alert, no reconciliation. Orphans are possible and
silent.

**Decision.** `api-idp` owns it, one implementation. Pair the saga with something that detects
orphans rather than trusting rollback to always work.

---

## Still open — not a decision, an investigation

### P12 — How do the existing 974 tests deal with schemas?

Not yet investigated. store-mgmt's `infra-db` tests run against a real Postgres with
`maxWorkers:1` and a shared test database, and three separate cross-suite contamination bugs were
fixed in that setup during the week of 2026-07-27. Adding tenant schemas on top is not obviously
free.

poolops's approach is one fixed test schema with the guards stubbed — precisely why it proves
nothing about isolation (P5).

**Owner agreed this is its own investigation before `sdd-design` finalizes**, not an implementation
detail. It could still be the largest hidden cost in the change, and it is the one item the premise
correction did NOT make cheaper.

---

## Next step

`sdd-design`, with the proposal folded in — the shape is locked, the exploration is unusually
complete, and every blocking decision above is taken. No cutover section. P12 is the one input
design must gather rather than assume.

## Unrelated work still open

Neither belongs to this change; recorded so they are not lost.

- **Commission reconcile endpoint** — `POST /commissions/accruals` from the archived change's
  design §9/Q6, never built. A failed accrual is currently recovered by hand in the database.
  Engram `backlog/commission-reconcile-endpoint`.
- **Combos** — owner defined them 2026-07-31 as a set of products with a single price and derived
  stock. Decided, documented, not implemented.
