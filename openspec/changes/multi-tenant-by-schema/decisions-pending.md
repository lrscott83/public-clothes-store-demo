# multi-tenant-by-schema — decisions pending

**Handoff for the next session. Nothing here is decided.** Every item carries a suggestion and
the evidence behind it, but the call is the owner's. Written 2026-08-02.

Where things stand: branch `salesops-multi-tenant-by-schema`, three commits, **not pushed**.

| Commit | What |
|---|---|
| `b80df29` | `company-isolation` exploration |
| `90dd42a` | that change superseded — target is schema-per-tenant |
| `7bd98fb` | `multi-tenant-by-schema` exploration, read from poolops-biz |
| `29908fd` | the open questions answered from code, second pass |

Artifacts: [`explore.md`](./explore.md) (section 6 holds the verified answers with `file:line`),
engram `sdd/multi-tenant-by-schema/explore` (#1562) and
`reference/poolops-tenancy-verified` (#1779).

## Already locked by the owner — do not re-open

1. **Tenancy shape: schema-per-tenant**, mirroring `poolops-biz`. Row-level `companyId` was
   considered and rejected. (2026-08-02)
2. **Several companies are coming.** This is what expired the 2026-07-28 deferral and what makes
   the whole change necessary.

## Decisions pending

Each has: the question, what the code shows, a suggestion, and what it blocks.

---

### P1 — How much locked downtime is acceptable for the cutover?

**The only question the code genuinely cannot answer.** Still unanswered from the last session.

**Evidence.** poolops has NO cutover precedent — zero `SET SCHEMA` anywhere in the repo, every
tenant is provisioned from an empty `tenant-schema.sql`, and its documented cutover is
destructive dev-only ("dev data is disposable"). store-mgmt has one real company's production
data to preserve, so this gets designed from scratch.

`ALTER TABLE … SET SCHEMA` is fast and copies nothing, but takes an exclusive lock per table,
and a partial cutover leaves cross-schema joins broken (`Order.warehouseId -> Warehouse`) until
every table lands. So it runs as one batch, in one window.

**Suggestion**: accept a short coordinated window (seconds to a couple of minutes) and do the
whole batch in one transaction. Zero-downtime is possible but costs a dual-write phase that is
disproportionate for a single company.

**Blocks**: the design's cutover section, and the tasks that stage it.

---

### P2 — Adopt poolops's collapsed `CompanyUser` PK?

**Evidence.** poolops: `CompanyUser.id String @id` IS the master `User.id`
(`tenant/schema.prisma:246-247`); `findByUserId` is `return this.findById(userId)`
(`company-user.repository.ts:77-79`). Zero hops, no translation table. store-mgmt today has a
separate `id` plus a `userId` soft-FK column — and the 2026-07-28 D1 claims that shape "is
poolops's verified shape", which is **not accurate**: the principle matches, the columns do not.

Cheap to change today — no real tenant-side FK depends on the current shape yet.

**Suggestion**: adopt the collapsed shape, and go one better than poolops — make the master user
id the SOLE primary key. In poolops, `CompanyCustomer.id` and `companyUserId` are allowed to
diverge and only convention keeps them equal (forced by hand at every `create()`), which is a
foot-gun.

**Blocks**: every FK to `CompanyUser` — `Order.attributedCompanyUserId`,
`CommissionAccrual.attributedCompanyUserId`, `CommissionPayment.recordedByCompanyUserId`.

---

### P3 — Copy poolops's per-tenant pool factory, or bound it first?

**Evidence.** Each pool takes pg's default of **10** connections (no `max` passed,
`tenant-prisma-factory.ts:49-52`). The cache is a `Map` with no eviction, TTL or LRU.
`disposeClient()` has **zero call sites in the whole repo** — only `disposeAll()`, and only from
CLI scripts and process-exit paths, never from a running server. So one instance holds
`(N + 1) × 10` connections, unbounded, against a cluster left at Postgres's default of 100.

poolops's own team drafted the fix (spec 045: single shared client + `SET LOCAL search_path`)
and never shipped it — 0 of 40 tasks checked, and the live schema lacks the `multiSchema`
preview feature that design requires.

**Suggestion**: copy the factory's shape, but set an explicit pool `max`, wire real disposal, and
record spec 045's target as a known future step rather than building it now. Do not copy it
verbatim, and do not chase 045 either.

**Blocks**: the infra-db design.

---

### P4 — One migration tool, and a drift check?

**Evidence.** poolops has TWO tools: `tenant-deploy-all.ts` (`migrate deploy` per tenant) and
`migrate-all-tenants.ts` (`prisma db push --accept-data-loss`), with nothing indicating which is
authoritative for production. Neither uses a transaction; on partial failure the fleet is left
in a mixed migration state by design. `pushSchema()` shells `execSync` per tenant with **no
timeout**, so one hung migration blocks the whole batch. And there is **no drift detection
anywhere** — zero hits for `drift`, `migrate status`, `_prisma_migrations`.

**Suggestion**: one tool only, with a timeout per tenant, and a drift check that fails loudly
when a tenant is behind. A fleet in mixed states that nothing reports is the kind of problem
found months later, by a bug.

**Blocks**: the migration strategy section of the design.

---

### P5 — Commit to writing the isolation test as new work?

**Evidence.** Nothing in poolops proves cross-schema isolation. `concurrent-isolation.test.ts`
is unshipped task T031 of the Draft spec 045. No test anywhere uses two tenant schemas in one
run. Its e2e suite stubs BOTH `JwtAuthGuard` and `TenantContextGuard` via `overrideGuard`
against one hardcoded schema, so the real guard is never exercised end to end.

**Suggestion**: yes — treat it as the change's proof obligation, budgeted as a deliverable, not
a chore. It would be the first of its kind in either codebase. Without it, "isolated" is an
assertion.

**Blocks**: nothing, but it must reach `tasks.md` explicitly or it will not get written.

---

### P6 — Where does tenant resolution live?

**Evidence.** poolops puts `TenantContextGuard` in `packages/api-common/src/guards/`, after
`JwtAuthGuard`. store-mgmt's own D4 precedent already put role resolution in `JwtStrategy`
rather than a new guard — the same tier.

A second finding worth deciding on deliberately: the guard's comment claims its
`AsyncLocalStorage` scope is long-lived across the request, but that is **stale** — 100+
downstream call sites re-open their own scope from `request.company`. That re-scoping is the
more robust pattern, because ALS may not survive NestJS's RxJS/interceptor pipeline.

**Suggestion**: guard in `packages/api-common/src/auth/`, matching D4's placement rather than
poolops's `guards/`. Adopt the re-scoping pattern deliberately, and write down WHY, so nobody
later "optimizes" it back into a single request-long scope.

**Blocks**: the delivery-layer design.

---

### P7 — Reshape `Customer` / `WarehouseOperator` in this change, or defer?

**Evidence.** Both hold real Prisma `@relation` FKs to master `User` (`schema.prisma:192, :509`).
Prisma **forbids** a relation across separate schema files, so these cannot survive the split —
this is enforced by tooling, not a preference. poolops's answer is the id-collapse of P2.

**Suggestion**: in this change. Deferring leaves the split half-done, and a half-split schema is
harder to reason about than either end state.

**Blocks**: the schema design and the cutover's table list.

---

### P8 — Adopt the master-templates → per-tenant-copy pattern for the catalog?

**New — surfaced by the audit, not previously on any list.**

**Evidence.** poolops keeps admin-editable `Template*` tables in master and, at company
creation, **copies** them into the new tenant's own tables (`CompanyDefaultsSeeder.seedNewCompany`).
Nothing is shared at runtime; every tenant's rows are physically its own.

This finally answers the question that dogged the superseded `company-isolation` change —
"is the catalog global or company-private?" The answer is neither: templated centrally, owned
per tenant.

**Suggestion**: adopt it for `Product`/`Category`. It gives a new company a working catalog on
day one without coupling it to anyone else's edits. But note P9 before copying the mechanism.

**Blocks**: the master/tenant table split, and provisioning.

---

### P9 — Background seeding, or seed before the tenant is usable?

**Evidence.** poolops's catalog seed is deliberately fire-and-forget — `void this.seedNewCompany(...)`
after the 201 already returned, because awaiting it pushed request latency past client timeouts.
The consequence is a real window where a brand-new tenant has a working owner account and **zero**
catalog data.

**Suggestion**: do not inherit this implicitly. Either seed synchronously (store-mgmt's catalog
is smaller than poolops's) or make the incomplete state explicit in the API. A company that can
log in and sees an empty catalog will read it as a bug.

**Blocks**: provisioning design.

---

### P10 — Introduce a master `Membership` table now?

**Evidence.** The 2026-07-28 D3 predicted the split: `status` → master `Membership`, `role` →
tenant `CompanyUser`, and deliberately withheld `Membership` so the future change would be "a
clean field extraction, not a redesign". The audit confirms poolops does exactly that — with one
nuance: its `CompanyUser` ALSO carries `isActive`, so "is this person active in this company"
lives in **two places**, master `Membership.status` and tenant `CompanyUser.isActive`, kept in
sync by hand.

**Suggestion**: introduce `Membership` as D3 planned, but do NOT duplicate the active flag. One
home for that fact. poolops's two-place version is drift waiting to happen.

**Blocks**: the master schema, and `api-idp`.

---

### P11 — Does `api-idp` own the provisioning saga?

**Evidence.** poolops duplicates `CompanyService.createCompany` across THREE apps because it has
three front doors and no identity app. store-mgmt has `api-idp`, which already owns User,
Company, CompanyUser and the token tables end to end via ports — a single natural home.

The saga itself is: create master Company → create schema → set `schemaName` → create Membership
→ create tenant CompanyUser → seed. With compensating rollback. **But poolops's compensation only
logs when a rollback step itself fails** — no retry, no alert, no reconciliation. Orphans are
possible and silent.

**Suggestion**: `api-idp` owns it, one implementation. And pair the saga with something that
detects orphans, rather than trusting rollback to always work.

**Blocks**: which app the provisioning code lands in.

---

### P12 — How do the existing 974 tests deal with schemas?

**Evidence.** Not yet investigated — flagged here so it is not discovered mid-implementation.
store-mgmt's `infra-db` tests run against a real Postgres with `maxWorkers:1` and a shared test
database, and this session already fixed three separate cross-suite contamination bugs in that
setup. Adding tenant schemas on top of that is not obviously free.

poolops's approach is one fixed test schema with the guards stubbed — which is precisely why it
proves nothing about isolation (P5).

**Suggestion**: treat this as its own investigation before `sdd-design` finalizes, not as an
implementation detail. It could be the largest hidden cost in the change.

**Blocks**: realistic sizing of the whole change.

---

### P13 — Verify the live `Company` row count

**Not a decision — an unmet precondition.** The single-company claim is structural (the seed
upserts one; no endpoint creates another), never confirmed against live data. `.env` access was
denied in this session and no ad-hoc query script exists.

**Suggestion**: confirm the count in `store_mgmt` and `store_mgmt_test` before any migration is
authored. If a second row was ever inserted by hand, the cutover plan changes.

---

## Questions for the owner, in the order they block work

1. **P1** — how much locked downtime for the cutover? *(blocks the design)*
2. **P2** — collapse `CompanyUser` to the master user id as sole PK? *(blocks the schema)*
3. **P7** — reshape `Customer`/`WarehouseOperator` in this change? *(blocks the schema)*
4. **P8 / P9** — adopt master-templates for the catalog, and seed synchronously? *(blocks provisioning)*
5. **P10** — introduce `Membership`, with the active flag in one place only? *(blocks the master schema)*
6. **P11** — `api-idp` owns provisioning? *(blocks placement)*
7. **P3 / P4 / P5 / P6** — the infra and delivery suggestions above. *(lower risk, but still yours)*
8. **P12** — agree to investigate the test-schema strategy before design? *(affects sizing)*

## Next step once P1, P2 and P7 are answered

`sdd-design` — the proposal phase can be folded in, since the shape is locked and the
exploration is unusually complete. Design must not finalize the cutover until P1 is answered.

## Unrelated work still open

Neither belongs to this change; recorded so they are not lost.

- **Commission reconcile endpoint** — `POST /commissions/accruals` from the archived change's
  design §9/Q6, never built. A failed accrual is currently recovered by hand in the database.
  Engram `backlog/commission-reconcile-endpoint`.
- **Combos** — owner defined them 2026-07-31 as a set of products with a single price and derived
  stock. Decided, documented, not implemented.
