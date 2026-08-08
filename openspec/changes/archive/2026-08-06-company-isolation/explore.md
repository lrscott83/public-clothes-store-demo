# Exploration: company-isolation

> **SUPERSEDED, 2026-08-02, before any code was written.** The owner answered this
> exploration's Open Question 4 with "several companies are coming", which invalidates the
> premise every option here rests on. Row-level `companyId` scoping (options a and b) is the
> work this document itself flagged as potentially throwaway against the sibling project's
> schema-per-tenant shape — and with a real second tenant expected, that risk is no longer
> hypothetical. Superseded by the `multi-tenant-by-schema` change, which resumes "Approach 1"
> from `openspec/changes/archive/2026-07-28-company-user-roles-reframe/`.
>
> **Kept because sections 1 and 2 remain accurate and useful**: the entity table (what is
> company-owned in principle vs company-linked today) and the JOIN-path asymmetry are facts
> about the current schema, independent of which tenancy shape wins. Sections 3-5 (options,
> backfill, open questions) are void.
>
> Three of this document's open questions dissolve entirely under schema-per-tenant: whether
> the catalog is global or company-private, what a supervisor sees for null-attribution orders,
> and whether the single-company guard fails hard or allows an opt-in. Each was an artifact of
> row-level scoping, not a real product question.

Surfaced by the adversarial verify of `sales-agents-commissions`
(`openspec/changes/archive/2026-08-02-sales-agents-commissions/verify-report.md`,
"Known, owner-deferred items #1"). Artifact store `hybrid`. Engram twin:
`sdd/company-isolation/explore` (#1774).

## The central question, answered with evidence

**Is `api-salesops` genuinely multi-tenant, or single-company with a `Company` table?**

**Single-company today, by explicit, repeated, owner-locked decision — not an accident.**
Three independent pieces of evidence, oldest to newest:

1. **Founding decision** (`docs/plans/backend-base-scaffold-design.md:9-10,170`): the backend
   was scoped as poolops-biz "adoptado en versión **lean** (**sin multi-tenant**, sin
   IdP/auth, sin worker)" — explicit YAGNI, justified by scale ("salesops hace 3-6
   pedidos/día").
2. **`company-user-roles-reframe` proposal** (`openspec/changes/archive/2026-07-28-company-user-roles-reframe/proposal.md:18-19,33-44`):
   owner explicitly LOCKED "Approach 2" (CompanyUser reframe, single schema) over "Approach 1"
   (full schema-per-tenant, mirroring poolops-biz exactly — dual Prisma clients,
   `TenantContextGuard`, `X-Company-Id`, tenant provisioning) because "there is no committed
   second tenant near-term." Approach 1 and a third option (row-level `companyId` tenancy) were
   both explored and explicitly deferred, not overlooked (`explore.md` of that change).
3. **Schema comment** (`schema.prisma:519-520`): "Single schema-per-tenant (design.md D1/D3):
   exactly one `Company` row exists in production today." `Company.schemaName` is a nullable,
   documented-inert hook for that deferred change — "ALWAYS null today — no code path may read it."
4. **Seed proves it structurally**: `infra-db/src/company/seed.ts` upserts exactly one Company
   (slug `default`) and there is NO controller/endpoint anywhere in `api-salesops` that creates a
   `Company` — the only way a second one could ever exist is a manual DB/script action.
5. **Sibling project (`poolops-biz`, reachable at `/home/coder/sources/poolops/poolops-biz`)
   IS genuinely multi-tenant**, but via **schema-per-tenant** (`prisma/master/schema.prisma` +
   `prisma/tenant/schema.prisma`, `TenantPrismaFactory`, one Postgres schema per tenant),
   **NOT row-level `companyId` columns**. Its tenant-side tables carry **zero** `companyId`
   column (isolation is physical/schema-level). `store-mgmt`'s `Company.schemaName` hook is
   explicitly aimed at converging on this SAME pattern later, not at row-level tenancy.
6. **Precedent for "decide now, defer code" already exists**: D6 in the same reframe proposal
   declares `ExchangeRate`/`Currency`/`PaymentChannel` "tenant-scoped" in writing with zero code
   change, specifically so "the deferred change inherits a decision instead of an open question."

**Conclusion**: the "isolation gap" is not spec/implementation drift (verify-report confirmed
`salesops-commissions/spec.md` never claims company isolation). It is a real, currently-inert
architectural gap sitting directly on top of THREE separate owner decisions to defer real
tenancy — but the `CompanyUser`/JwtStrategy/`@Roles()` machinery built since 2026-07-28 creates
the *appearance* of tenant boundaries that no controller, service, or repository in
`api-salesops` actually enforces by company. `rg companyId` under `apps/api-salesops/src` shows
WRITES only (customer-identity, order/commission attribution) — zero reads used to FILTER
anything by company.

## 1. Current state — company-owned in principle vs. company-linked today

| Entity | Company-owned in principle | Carries a company relation today | Path to `Company` |
|---|---|---|---|
| `CompanyUser` | Yes (this IS the membership table) | Yes — `companyId` `@relation` (`schema.prisma:551,561`) | Direct FK |
| `Order` (`sales_order`) | Yes | No `companyId`. Has `attributedCompanyUserId` (**NULLABLE**, deliberately not backfilled — historical orders stay `null` forever) `-> CompanyUser.companyId` | 1-hop JOIN, **INCOMPLETE** — only covers post-cutover orders |
| `CommissionAccrual` | Yes | No `companyId`. Has `attributedCompanyUserId` (**NOT NULL**) `-> CompanyUser.companyId` | 1-hop JOIN, **COMPLETE** (100% of rows) |
| `CommissionPayment` | Yes | No `companyId`. `accrualId -> CommissionAccrual.attributedCompanyUserId -> CompanyUser` (2-hop) OR `recordedByCompanyUserId -> CompanyUser` (1-hop, alt path) | Indirect, **COMPLETE** either way |
| `Product` | Yes in principle, **or global catalog — genuinely open, no evidence either way** | **None**, direct or transitive | NONE |
| `Warehouse` | Yes in principle | **None** | NONE |
| `Customer` | Yes in principle | `userId -> User` (1:1), but `User` itself carries no company link (only a separate `CompanyUser` row keyed by `userId` would, and `Customer` never traverses it) | NONE |
| `Category`, `StockLevel`, `StockMovement`, `OrderLine`, `OrderPayment`, `SaleCredit`, `ProductCommissionReference` | Inherit from parent | Inherit parent's NONE/partial status | Via parent only |

Confirmed at the delivery layer, not just the schema:

- `CommissionController.recordPayment` -> `CommissionService.recordPayment` ->
  `accrualRepository.findById(dto.accrualId)` — **zero scoping parameter exists on `findById`
  at all** (`prisma-commission-accrual.repository.ts:131-137`). Any `owner`/`admin` on ANY
  company can settle ANY company's accrual by UUID.
- `CommissionController.scopeFor` / `listAccruals`/`report` only restrict a bare `sales_agent`
  (`isScopedSalesAgent` — sales_agent AND NOT owner/admin/sales_operator) to their own
  `companyUserId`. Every other role — `owner`, `admin`, `sales_operator`, **regardless of which
  company they belong to** — sees ALL accruals/report rows system-wide. Doc comment says
  "sees the company"; code delivers "sees everything."
- `OrderController`: `list`/`findById` scope `warehouse_operator` (by warehouse) and
  `sales_agent` (by attribution, correctly treating `null` attribution as matching nobody —
  a good defensive precedent). `owner`/`admin`/`sales_operator` are explicitly documented and
  coded as unscoped ("see every order"). `confirm`/`cancel` have **NO scoping check of any
  kind** — not even warehouse — reachable by `owner`/`admin`/`sales_operator` cross-company via
  UUID guess.

## 2. The asymmetry that matters (cost driver for every option)

- **Orders + commissions (accrual, payment) already hang off `CompanyUser`** via
  `attributedCompanyUserId` / `recordedByCompanyUserId`. Scoping them by company costs **zero
  schema changes** — a repository-level JOIN/filter addition only. The one wrinkle: `Order`'s
  attribution column is nullable and NOT backfilled (deliberate, documented, to avoid
  fabricating financial evidence) — so join-scoping is airtight for `CommissionAccrual`/
  `CommissionPayment` (100% coverage) but leaves pre-attribution `Order` rows with no company
  signal at all.
- **Product, Warehouse, Customer have NO path to `CompanyUser`, direct or transitive.** Scoping
  these requires NEW columns + migrations + a backfill decision — there is nothing to JOIN
  through. This is the real fork between "cheap" and "expensive" tenancy.

## 3. Options (no winner picked — see Constraints)

### (a) Full tenancy — add company relations + migrations + backfill everywhere

Add `companyId` (or equivalent) to `Product`, `Warehouse`, `Customer`, and enforce it as a
domain-port filter parameter (per `docs/system/architecture.md`'s "ports the domain defines")
in every repository/service/controller across `api-salesops` (9 controllers, ~9 repositories).

- **Blast radius**: ~6-8 tables get new columns + migrations; every list/find on every
  repository gains a scope parameter; every controller must thread `req.user.companyId`
  through; hundreds of tests need a second seeded company to prove isolation actually works
  (today's tests can't distinguish "scoped correctly" from "only one company exists").
- **What breaks**: forces an unanswered business-model question — is `Product` catalog
  company-private or shared/global master data across future companies (e.g. a shared price
  book)? No evidence supports either answer today; Option (a) can't be scoped without picking one.
- **Cost to reverse**: High. Once every table has a `companyId` column and every query path
  depends on it, removing it again is a wide mechanical change across the same surface.
- **What it leaves unprotected**: nothing, if done completely and correctly — but a *partial*
  full-tenancy rollout (miss one repository) is worse than (b) or (c): it produces the same
  false sense of security the current `CompanyUser` machinery already creates, just wider.
- **Architecture fit**: doing this ONLY as an adapter-level `WHERE company_id = ?` (Prisma-only)
  would leak a business rule into infra, violating the doc's "ports the domain defines, adapters
  implement" rule. To respect the architecture, every affected repository PORT (not just the
  Prisma adapter) needs an explicit scope parameter, and the domain/application layer decides
  who is allowed to bypass it (e.g., is there ever a cross-company god role?) — that decision
  logic belongs in `packages/domain`, not smuggled into `infra-db`.
- **Effort**: High.

### (b) Scope-by-join only where a `CompanyUser` path already exists

Add `companyId` filtering to `Order` (via `attributedCompanyUserId`, with an explicit fallback
policy for `null`-attribution legacy rows) and to `CommissionAccrual`/`CommissionPayment` (via
their existing FK chains) — zero new columns. Leave `Product`, `Warehouse`, `Customer` explicitly
global (no scoping, no change).

- **Blast radius**: `commission.service.ts`, `prisma-commission-accrual.repository.ts`,
  `prisma-commission-payment.repository.ts`, `order.service.ts`, `prisma-order.repository.ts`,
  the two controllers' scope helpers. No migrations. `JwtStrategy` already exposes
  `req.user.companyId` — no new auth plumbing needed.
- **What breaks**: nothing structurally — additive filtering only. Single-company deployments
  (today's reality) see zero behavior change. Isolation only becomes observable once a second
  company exists.
- **Cost to reverse**: Low — a filter parameter is cheap to relax or drop.
- **What it leaves unprotected**: `Product`/`Warehouse`/`Customer` remain globally
  readable/writable to any authenticated user of any company, indefinitely, by construction (no
  path exists to scope them without (a)'s schema work). This is an explicit, honest gap, not a
  silent one — but it is still a gap a second real company would hit on day one for anything
  catalog-shaped.
- **Architecture fit**: fits cleanly — the filter is just another `OrderListFilter`/
  `CommissionAccrualFilter` parameter, same shape as the existing `customerId`/`status`/
  `attributedCompanyUserId` filters, expressed at the port level, not adapter-only.
- **Effort**: Low-Medium.

### (c) Declare the system single-company explicitly; document the invariant + a guard

Formalize what is already true by construction (exactly one `Company` row, no code path creates
a second one) into an enforced, loud invariant — mirroring the already-shipped pattern for
signup (D5: "Zero/multiple companies fails loudly") and D6 (decide-now, no code today). E.g. a
boot-time or write-path assertion that refuses to ever create `Company` #2 without an explicit,
reviewed migration, plus a doc note on every `api-salesops` controller/service that currently
assumes single-company that it does.

- **Blast radius**: tiny — one guard/assertion, doc updates on the Company model and
  `docs/system/architecture.md`, no behavior change to any existing endpoint.
- **What breaks**: nothing.
- **Cost to reverse**: Near zero — does not foreclose (a) or (b) later; it converts today's
  *accidental* single-company state (true only because nobody built a second-company path) into
  a *monitored* one (true because something would fail loudly if violated).
- **What it leaves unprotected**: identical exposure to today for a *hypothetical* second
  company — but that hypothetical currently has no legitimate way to occur. The residual risk
  this closes is specifically the SILENT one: a bug, an admin script, or a bad migration
  creating `Company` #2 today would immediately and invisibly leak Product/Warehouse/Customer/
  cross-company Orders/Commissions to every user, with no test anywhere that would catch it
  (no test seeds two companies to prove isolation, because none is claimed).
- **Architecture fit**: neutral — no port/adapter work either way.
- **Effort**: Low.
- **Expected to be contentious**: this option "closes" a reported gap by writing down that it's
  intentional rather than narrowing it. Given this repo's adversarial-verify culture (see the
  sales-agents-commissions verify-report's rigor), a reviewer could reasonably argue this is
  ratifying scope rather than reducing risk — even though it is the option most consistent with
  the owner's own 2026-07-28 and founding-scaffold decisions.

A natural, unscored hybrid worth naming (not evaluated further per the "no winner" constraint):
(b) + (c) together — cheap join-scoping for the two entities that already support it, PLUS an
explicit documented/guarded decision that Product/Warehouse/Customer are global master data,
closing the silent-second-company risk everywhere at once for the cost of (b) alone.

## 4. Backfill problem

- Because exactly one `Company` row exists **by construction** (seeded via `slug: 'default'`,
  no endpoint anywhere creates a second one), any NEW `companyId` column on `Product`/
  `Warehouse`/`Customer` has a **structurally trivial backfill**: every existing row gets the
  single company's id, zero ambiguity — the exact precedent already used in migration
  `20260727200000_add_company_and_company_user` (a CTE that seeds the one company and
  CROSS JOIN-backfills every existing `app_user` row into `company_user` in one statement).
- The alternative precedent also exists in this codebase: `sales_order.attributed_company_user_id`
  (migration `20260729140000_add_order_sales_attribution`) was added **nullable and
  deliberately NOT backfilled** — historical orders stay `null` forever, with a documented
  rationale (inventing an attribution would fabricate financial evidence). That rationale is
  specific to financial attribution and does NOT transfer cleanly to `Product`/`Warehouse`/
  `Customer`: "we don't know which company owned this catalog row" has no equivalent
  "don't fabricate evidence" justification — leaving those nullable-and-unbackfilled would just
  produce inconsistent list/read behavior (some rows globally visible, most not) rather than a
  principled gap.

### Live verification (added by the orchestrator, 2026-08-02)

The exploration session had no DB access and flagged the single-company claim as structural,
not verified. It has since been checked against both live databases — see the "Live company
count" note below.

## 5. Open questions for the owner

1. Given the explicit 2026-07-28 decision to defer real tenancy ("no committed second tenant
   near-term") and the founding scaffold's YAGNI stance — has anything changed since then that
   makes real isolation urgent now, or should this change simply formalize the single-company
   invariant (Option c)? **Answerable yes/no.**
2. If real isolation is wanted: is it acceptable to isolate Orders + Commissions only (Option b),
   leaving Product/Warehouse/Customer explicitly GLOBAL/shared across all future companies (a
   legitimate "shared catalog, tenant-scoped sales" SaaS shape) — or must catalog data also be
   company-private (Option a)? **This is a business-model choice, not a technical one — pick b, a,
   or "catalog stays global forever" explicitly.**
3. For Option (b): pre-cutover `Order` rows with `attributedCompanyUserId = null` can't be
   company-scoped by the existing JOIN. Given only one company has ever existed, is this a real
   concern to resolve now, or moot until an actual second company is created? **Answerable
   yes/no/defer.**
4. Is a second `Company` row ever expected for reasons OTHER than a paying second tenant — e.g.
   a staging/demo/sandbox environment, or a franchise pilot? This changes urgency independent of
   "is this a genuine multi-tenant SaaS product." **Answerable yes/no.**
5. If Option (a) is chosen: is `Product` catalog company-private or shared master data (e.g. one
   price book across companies)? No evidence today supports either answer — this fork determines
   Option (a)'s actual shape, not just its implementation detail. **Must be answered, not
   inferred.**
6. Independent of the (a)/(b)/(c) choice: should the cheap half of Option (b) — join-scoping
   Orders/Commissions by company — happen regardless, as free insurance against a future silent
   second-company mistake, decoupled from the catalog-scoping decision? **Answerable yes/no.**

## Risks

- The `CompanyUser`/`@Roles()` machinery reads as tenant-safe (elaborate JwtStrategy resolution,
  `companyId` on every `SanitizedUser`) while enforcing zero company-level filtering anywhere in
  `api-salesops` — a genuine false-sense-of-security risk for anyone extending this code without
  reading this exploration first.
- No test in the repository seeds two companies to prove isolation one way or the other; the
  gap is invisible to the existing (974-test) suite by construction.
- `poolops-biz`'s own path (schema-per-tenant) is a different SHAPE of tenancy than row-level
  `companyId` (Options a/b here) — if the owner later wants full architectural parity with the
  sibling project, Option (a)/(b)'s row-level work could be partially throwaway relative to a
  future schema-per-tenant migration, exactly as flagged in the original
  `multi-tenant-by-schema` exploration (`company-user-roles-reframe/explore.md`).

## Ready for Proposal

**No — not without an owner answer to Open Questions 1-2 at minimum.** They are the same class
of structural fork the `sales-agents-commissions` exploration hit on gestor identity: the
(a)/(b)/(c) choice is a business-model decision (is this actually going to be sold to a second
company, and is the catalog shared or private), not something derivable from the code.
