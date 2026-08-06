# Verify Report — backend-users-roles

**Date**: 2026-08-06
**Verifier**: sdd-verify (independent gate — re-derived, not a replay of Phase 6)
**Branch**: `salesops-multi-tenant-by-schema` @ `f25ee10` (tree clean, verify-only, no commits made)
**Verdict**: **PASS WITH WARNINGS**
**CRITICAL**: 1 (CLOSED) · **WARNING**: 2 (CLOSED) · **SUGGESTION**: 2 (CLOSED)
**All findings resolved 2026-08-06. Nothing is left open on this change.**

> **Post-verify amendment (2026-08-06)**:
> - **CRITICAL** closed by owner decision — "Self-Service Buyer Authentication Flow" is
>   formally DEFERRED, not implemented. Two corrections to this report's original framing
>   are recorded in that section.
> - **WARNING 1 & 2** (design.md doc drift) closed — `design.md` now opens with an
>   **Amendment log** table mapping every stale statement to the shipped reality and the
>   change that superseded it, plus inline `> **Superseded**` notes at §1, §2, §5 and §6.
>   The original text is preserved verbatim; the record was annotated, not rewritten.
> - **SUGGESTION 1** closed — it *was* the fix applied for the two WARNINGs above.
> - **SUGGESTION 2** closed — `tasks.md` task 6.3's scenario-coverage claim is corrected
>   in place: the "Buyer Auth 2" coverage entry was false and the count of 9 testable
>   requirements is now **8 testable (all covered) + 1 untestable + 1 deferred**.

## Important context: this change was reshaped in-place by later changes

`backend-users-roles` shipped single-tenant (`User.roles` bitmask, `Customer.userId → User`).
Two later archived changes amended it in-place:
- `company-user-roles-reframe` moved the bitmask to `CompanyUser.role`.
- `multi-tenant-by-schema` (archived `12a3d4c`) split the Prisma schema into
  `prisma/master/schema.prisma` (User/RefreshToken/PasswordResetToken/Company/Membership) and
  `prisma/tenant/schema.prisma` (CompanyUser/Customer/WarehouseOperator/...), because Prisma
  forbids a cross-schema `@relation`. `Customer.userId` became `Customer.companyUserId`,
  `OperadorAlmacen` became `WarehouseOperator`, and role resolution moved from `JwtStrategy`
  into a new `TenantContextGuard`.

Per the task brief, I verified the **merged specs** (`openspec/specs/salesops-identity/spec.md`,
`openspec/specs/salesops-customers/spec.md`) — the current source of truth — against the
**current tree**, not the frozen original delta text in the change folder. Every claim below
cites the merged spec's requirement/scenario names.

## Test evidence (all executed by me, this session, real Postgres at 172.17.0.1:5432/store_mgmt)

| Package | Command | Result |
|---|---|---|
| `packages/domain` | `pnpm test` (vitest) | **294/294 passed**, 25 files |
| `packages/infra-db` | `pnpm test` (jest, real PG, maxWorkers:1) | **299/299 passed**, 36 suites, 40.4s |
| `packages/api-common` | `pnpm test` (jest) | **43/43 passed**, 5 suites |
| `apps/api-idp` | `pnpm test` (jest, unit) | **68/68 passed**, 6 suites |
| `apps/api-idp` | `pnpm test:e2e` (real PG) | **13/13 passed**, 2 suites |
| `apps/api-salesops` | `pnpm test` (jest, unit) | **318/318 passed**, 21 suites |
| `apps/api-salesops` | `pnpm test:e2e` (real PG) | **85/85 passed**, 9 suites, 13.5s |
| **Total unit** | | **1022/1022** (matches Phase 6's count exactly — reproducible) |
| **Total e2e** | | **98/98** (matches Phase 6's count exactly — reproducible) |
| Root `pnpm run typecheck` | turbo, 14 tasks | **14/14 exit 0** |
| Root `pnpm run build` | turbo, 9 tasks | **9/9 exit 0** |
| `domain`/`infra-db`/`api-common`/`api-idp`/`api-salesops` `lint` | `eslint --max-warnings 0` | **all 5 exit 0, zero output** |
| Boundary check (direct grep, not trusting the lint rule) | `rg '@store-mgmt/(infra\|api)' packages/domain/src` | **0 hits** |
| Boundary check | `rg '@store-mgmt/(api-common\|infra-db\|api-salesops)' apps/salesops-mvp/app apps/static-store/app` | **0 hits** |

I rebuilt `domain` → `infra-db` → `api-common` before running any e2e suite, so both e2e runs
exercised fresh dist per the strict-TDD note. No suite failed; nothing papered over.

## Spec conformance — `salesops-identity` (merged)

| Requirement | Status | Evidence |
|---|---|---|
| User Identity Entity (login-unique, no `roles`, no `isEmailVerified`) | PASS | `packages/domain/src/users/user.ts` — no `roles` field on `User`; `password-hash` bcrypt-shape invariant (`user.ts:62-63`, `InvalidUserError`); `errors.ts` `DuplicateLoginError`; covered by `user.test.ts` (11 tests) + `prisma-user.repository.spec.ts` |
| Bitmask Multi-Role, Union Permissions, sourced from `CompanyUser.role` | PASS | `packages/domain/src/users/roles.ts` — bit values match exactly (`user=1, warehouse_operator=2, sales_operator=4, owner=8, admin=16, sales_agent=32`); `effectiveRoles`: admin→ALL, owner→BUSINESS_ROLES_MASK (includes `sales_agent`); `roles.test.ts` (14 tests); role-0-is-valid tested in `company/models.test.ts:31-32` |
| Authentication Mechanism (bcrypt, rotate+reuse-detect, change-password revokes, reset single-use) | PASS | `apps/api-idp/src/auth/auth.service.ts`; `auth.service.spec.ts` (19 unit) + `test/auth.e2e-spec.ts` (full HTTP lifecycle, real PG) — replay-of-rotated-token-revokes-family, change-password kills sessions, second reset-confirm 401, enumeration-safe unknown-login/wrong-password |
| Role Resolution at Authentication Time (JwtStrategy master-only, TenantContextGuard populates roles/companyId, JWT carries only `sub`, MISSING_COMPANY_USER distinct 403) | PASS | `packages/api-common/src/auth/jwt.strategy.ts` (`AuthenticatedUser` has no `roles`/`companyId`) + `tenant-context.guard.ts` (steps 1-5 as specced); `jwt.strategy.spec.ts` scenario "validate() returns only master-side identity"; `tenant-context.guard.spec.ts` scenario "a genuinely missing tenant CompanyUser row → 403, distinct from the 500 DB-error case" |
| `@Roles()`/`RolesGuard` Enforcement (401/403/admit, `roles===undefined` → loud 403 "Tenant context not resolved") | PASS | `packages/api-common/src/auth/roles.guard.ts`; `roles.guard.spec.ts` — 10 cases including both guard-order-invariant cases |
| OperadorAlmacen (now `WarehouseOperator`) Warehouse Scope (1 warehouse/operator, N operators/warehouse, scoped reads) | PASS | `packages/infra-db/prisma/tenant/schema.prisma:466-477` (`warehouseId` not unique); `prisma-warehouse-operator.repository.spec.ts`; scope enforcement in `apps/api-salesops/src/stock/stock.controller.ts` and `src/sales/order.controller.ts` (`assertWarehouseScope`/`scopeToOperatorWarehouse`) |
| Deferred/Non-Goals (fine-grained owner-finance perms, email verification absent; `Company`/`CompanyUser` now exist, `Membership`/tenant-context now exist too) | PASS | No `isEmailVerified` anywhere in `domain/src/users`; `company`/`company_user`/`membership` tables all present in current schema — matches the merged spec's "superseded" scenario, not the original "does not exist" one |

## Spec conformance — `salesops-customers` (merged, identity-link portion only — the rest of this capability's requirements, e.g. `documentId` uniqueness/soft-delete/seed, belong to `backend-customers` and are out of this change's scope)

| Requirement | Status | Evidence |
|---|---|---|
| Customer FKs Tenant CompanyUser, Not Master User (`companyUserId` required+unique, no `userId` anywhere) | PASS | `packages/infra-db/prisma/tenant/schema.prisma:194-215`; `packages/domain/src/customer/customer.ts:16-23` — explicit doc comment citing the reshape; `rg userId domain/src/customer` → 0 hits |
| Pre-Existing Customers Are Backfilled (no orphan rows) | PASS (by construction) | The multi-tenant reshape retired the pre-split monolith schema/migrations entirely (task 14.2, commit `945b8ec`) rather than migrating live data — every tenant schema is provisioned fresh via `prisma/tenant-schema.sql` with `company_user_id` NOT NULL from creation, so the "no orphan" invariant holds trivially, not via a backfill CTE. This is a legitimate, documented resolution of the original risk, not a gap. |
| **Self-Service Buyer Authentication Flow** (anonymous browse/cart, auth required only at payment, Customer+User created together at checkout) | **CRITICAL — CLOSED, DEFERRED by owner 2026-08-06** | See below |

### CRITICAL — Self-Service Buyer Authentication Flow has no implementation → CLOSED (DEFERRED)

**Resolution (2026-08-06, owner decision)**: descoped via option (b). The requirement is marked
DEFERRED in `openspec/changes/backend-users-roles/specs/salesops-customers/spec.md` with its
reason recorded there. It is not part of this change's contract and does not block archive.
Reinstating it means opening a new change once a live checkout exists.

**Two corrections to the original finding below**, both established while resolving it:

1. **The merged spec does NOT carry this requirement.** It exists only in this change's delta
   spec. `openspec/specs/salesops-customers/spec.md` has no such requirement — it was dropped
   during an earlier merge. The live contract never demanded it. The finding's substance (a
   requirement written with no proposal, design, task, or implementation behind it) stands;
   its blast radius was smaller than stated.
2. **Option (a) — building it — was not on the table.** The flow is storefront + checkout
   territory (`apps/static-store`, `packages/storefront`), frozen as LEGACY, and no payment
   step exists in the backend for authentication to gate.

Original finding, retained for the record:

- **What**: The `salesops-customers` delta spec carries a full requirement with 3 scenarios
  (anonymous browsing/cart without auth, auth required at payment, Customer+User created
  together at checkout). I searched the entire repo (`apps/static-store`, `apps/salesops-mvp`,
  `packages/storefront`, `apps/api-salesops`, `apps/api-idp`) for any checkout/payment-gated
  auth flow, buyer self-registration, or anonymous-cart concept. **None exists.** `static-store`
  has a "currency-selector-checkout" feature (UI only, no auth). `api-idp`'s `POST /auth/signup`
  exists but is not wired to any storefront/checkout flow.
- **Why this is real, not a false positive**: I checked spec history — `git log -p` shows this
  requirement was present in the ORIGINAL `backend-users-roles` delta spec from its very first
  commit (`7013b7f`), not a later amendment. But `proposal.md` and `design.md` for this change
  **never mention** storefront/buyer/checkout/anonymous browsing anywhere — the proposal's scope
  is explicitly backend identity + auth mechanism + guard enforcement. `tasks.md` has zero tasks
  addressing it, and its own "Out of Scope" section doesn't list it as deferred either. This
  looks like scope that entered at the spec-writing step without a corresponding proposal/design
  decision or task, and neither Phase 5 apply nor Phase 6 verification caught it (Phase 6's own
  scenario-coverage claim, "every one of the 9 testable requirements has at least one covering
  spec file," implicitly treats this one as untestable/out — it is not that it's inherently
  untestable, it is that nothing was built for it).
- **Recommendation**: this is a decision for the user/orchestrator, not something for me to
  fix — either (a) build the flow in a follow-up change (`static-store`/`salesops-mvp` are noted
  elsewhere as frozen, so this would need explicit scope authorization), or (b) amend the merged
  spec to formally drop/defer this requirement with a documented reason, matching how this same
  spec already handles other superseded requirements (its own "(Previously: ...)" convention).

## Architecture conformance (`docs/system/architecture.md`)

| Check | Status | Evidence |
|---|---|---|
| Pure domain (no framework/Prisma imports) | PASS | `rg '@store-mgmt/(infra\|api)' packages/domain/src` → 0 hits |
| Web apps never import backend-only packages | PASS | `rg '@store-mgmt/(api-common\|infra-db\|api-salesops)' apps/salesops-mvp/app apps/static-store/app` → 0 hits |
| Infra enters via domain-defined ports | PASS | `IUserRepository`/`IRefreshTokenRepository`/`IPasswordResetTokenRepository`/`IWarehouseOperatorRepository` all defined in `packages/domain/src/users/*.port.ts`; Prisma implementations live in `packages/infra-db/src/users/` |
| Shared auth kit lives in a package, not an app | PASS | `packages/api-common/src/auth/*` — consumed by both `apps/api-idp` and `apps/api-salesops`, per ADR-3 |
| Hashing never runs in the domain | PASS | `rg 'bcrypt.hash\|bcrypt.compare\|genSalt' packages/domain` → 0 hits; hashing lives in `apps/api-idp/src/auth/auth.service.ts` |

## WARNING findings

> **BOTH CLOSED 2026-08-06.** `design.md` now carries an Amendment log table (right after
> its header) plus inline `> **Superseded**` notes at §1 Component/layer map, §2 Data model,
> §5 Auth mechanism and §6 RolesGuard. Each entry names the stale statement, the shipped
> reality, and the change that superseded it (`multi-tenant-by-schema`,
> `company-user-roles-reframe`, the code/DB-English convention). Original text preserved.

1. **Design.md's `OperadorAlmacen` naming and `email: string?` non-unique note are now
   partially stale** — the shipped entity is `WarehouseOperator` (renamed per the
   code/DB-English convention, documented in `tasks.md` Phase 2's own deviation note) and the
   master-schema reshape moved `email` off any FK-adjacent concern entirely. This is
   already self-disclosed in `tasks.md`/schema comments, so it is a documentation-drift
   WARNING, not a behavior gap — design.md itself was never updated to reflect either the
   rename or the schema split. Low risk since the comments in the actual schema/code carry
   the authoritative explanation.
2. **`design.md`'s Phase-3/4/5 file-level plan (`refresh-token.dto.ts`, single
   `password-reset.dto.ts`, `apps/api-common` guard order of two guards) diverges from what
   shipped** (`refresh.dto.ts`, split request/confirm reset DTOs, a THREE-guard chain
   `JwtAuthGuard → TenantContextGuard → RolesGuard`). Every one of these is explicitly
   flagged and justified in `tasks.md`'s own deviation notes (Phase 4 preamble, and the
   `api-common/jwt.strategy.ts` doc comments for the guard-order rewrite) — so this is
   already-disclosed drift from a later change's rework, not a silent implementation gap.

## SUGGESTION findings

> **BOTH CLOSED 2026-08-06.** #1 was applied verbatim — it is the fix used for the two
> WARNINGs above. #2 was applied to `tasks.md` task 6.3: the false "Buyer Auth 2" coverage
> entry is struck through and the count corrected to 8 testable / 1 untestable / 1 deferred.

1. Consider updating `design.md` §1's component/layer map and ADR set with a short
   "superseded by multi-tenant-by-schema" pointer (mirroring how the merged spec files
   already carry "(Previously: ...)" amendment notes) so a reader of `design.md` alone isn't
   misled about the current schema split or guard chain.
2. `tasks.md`'s Phase 6 scenario-coverage claim ("every one of the 9 testable requirements
   has at least one covering spec file") should be revisited now that the merged spec has a
   10th requirement in `salesops-customers` (Self-Service Buyer Authentication Flow) that is
   neither covered nor explicitly marked non-testable/deferred — closing the CRITICAL above
   would also resolve this count mismatch.

## Completeness — tasks.md

All 72 tasks across Phases 1-6 are checked `[x]` and I independently reproduced their claimed
evidence (test counts, lint, typecheck, build, boundary greps) rather than trusting the
checkmarks. No task is checked off without matching code/test evidence in the current tree.

## Final verdict

**PASS WITH WARNINGS.** The identity/auth/roles/warehouse-scope core of this change is fully
implemented, spec-conformant against the current merged specs, architecture-conformant, and
backed by real, reproducible green test runs (1022 unit + 98 e2e, this session). The one
CRITICAL is a spec/proposal scope mismatch (Self-Service Buyer Authentication Flow) that
predates apply and was never actioned by any phase — it should be resolved (build or
formally descope) before this change is archived as fully complete, but it does not indicate
a defect in the identity/auth/roles work that *was* built.
