# Archive Report — company-user-roles-reframe

**Status**: SUCCESS (spec merge) / ACTION REQUIRED (physical folder move — see "Known Limitation" below)
**Date**: 2026-07-28
**Change**: company-user-roles-reframe
**Artifact Store**: hybrid (openspec + engram)
**Branch**: `salesops-company-user-roles`, 13 commits, pushed, no PR (owner delivery model: single branch, work-unit commits, no PR flow)

---

## Lineage

- Backlog origin: Engram `#1516`, item 3.
- Renamed from `multi-tenant-by-schema` — delivered scope is NOT schema tenancy (schema-per-tenant infra deferred to a future change). Exploration keeps the old topic key `sdd/multi-tenant-by-schema/explore`.
- Delivered as 3 sequential verified phases (PR1 foundation, PR2 behavioral cutover, PR3 test-fixture migration + migration 002) on ONE branch — owner-locked delivery model, no PR flow, per prior owner decision recorded in `sdd-init/public-clothes-store-demo`.

## Verification Verdict

**PASS WITH WARNINGS, 0 CRITICAL** — all 5 warnings (W1-W5) subsequently investigated and closed:
- **W1** (16 infra-db failures) — NOT REPRODUCIBLE; verifier artifact from running the backfill-verify script (which seeds) before the test suite (which needs an empty DB) without being able to `prisma migrate reset` (sub-agents hit Prisma's AI-safety consent gate). On a reset DB: 142/142 green.
- **W2** — REAL, fixed. `jwt.strategy.spec.ts:117` still passed `roles` to `activeUser()`. Root cause: `tsconfig.json` excludes `**/*.spec.ts` in every package, so `pnpm -r build` type-checks no spec file anywhere, and a regex compile-error sweep cannot catch a dropped field surviving inside a mock.
- **W3** — accepted deviation, recorded in design.md §9 row 11 (no permanent spec around `verify-company-user-backfill.ts`).
- **W4** — REAL, fixed. `salesops-identity` spec said "9 api-salesops controllers"; actual is 7 (verified via `rg -l '@UseGuards' --glob '*.controller.ts'`).
- **W5** — closed with a runtime test: `auth.e2e-spec.ts` now base64url-decodes the issued access token and asserts `companyId`/`roles` absent, `sub` present (previously type-only).

Final matrix (clean DB, re-run by hand after fixes): build clean · domain 249/249 · infra-db 142/142 · api-common 31/31 · api-idp 54/54 + 11/11 e2e · api-salesops 181/181 + 50/50 e2e. D4 re-confirmed: `git diff` over every api-salesops controller = EMPTY (zero-edit guarantee held).

Full spec-compliance matrix and resolution table: `verify-report.md` in this folder (Engram `sdd/company-user-roles-reframe/verify-report`, observation #1594).

---

## Merged Specs

### New capability: `openspec/specs/salesops-companies/spec.md`

Copied in full (NEW capability, not a delta) — 5 requirements, 12 scenarios:
1. Company Entity (schemaName nullable/unread hook, D3)
2. CompanyUser Soft-FK Shape (no DB-level FK to User, D1)
3. Single-Company Auto-Assignment on Signup (D5: 1→auto-assign, 0→500, >1→409)
4. CompanyUser Status Gates Access (non-active == same denial as missing row)
5. Additive-Then-Drop Migration Lifecycle (D7: 001 additive+backfill, 002 drops `app_user.roles`)

### Modified capability (delta merged in place): `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md`

**IMPORTANT — this base spec was NOT archived.** `backend-users-roles` remains its own unarchived change; only its `salesops-identity/spec.md` file received the delta merge, per the explicit merge-target instruction carried in both `company-user-roles-reframe/tasks.md`'s header and the delta spec's own header. `backend-users-roles/proposal.md`, `design.md`, `tasks.md`, and the `salesops-customers` spec under that same change folder were NOT touched.

Merged 1 ADDED + 4 MODIFIED requirements:

| Requirement | Action | Change |
|---|---|---|
| Role Resolution at Authentication Time | ADDED | New requirement: `JwtStrategy.validate()` resolves `CompanyUser`, `SanitizedUser.roles` sourced from `CompanyUser.role`, gains `companyId`; JWT payload unchanged (`sub` only); missing `CompanyUser` → distinct logged `403 MISSING_COMPANY_USER`. Inserted between "Authentication Mechanism" and "@Roles()/RolesGuard Enforcement". |
| User Identity Entity | MODIFIED | `roles` row removed from the field table; added "(Previously: ...)" note; added scenario "No roles field on User". |
| Bitmask Multi-Role with Union Permissions | MODIFIED | Source changed from `User.roles` to `CompanyUser.role` throughout; added scenario "Role bitmask of 0 denies every specific check but is not an error". |
| @Roles()/RolesGuard Enforcement | MODIFIED | Guard logic text confirmed UNCHANGED (doc clarification only) — upstream source of `req.user.roles` now resolved in `JwtStrategy`; scenarios re-worded from "a user holding..." to "a `CompanyUser` holding..." (no behavioral change). |
| Deferred / Non-Goals | MODIFIED | "No multi-tenant tables exist" scenario SUPERSEDED (Company/CompanyUser now exist by design) and replaced with "Company/CompanyUser exist, tenant-context machinery does not"; `gestor`-role scenario kept unchanged. |

Untouched sections in that same file (delta did not target them, preserved verbatim): Purpose, Authentication Mechanism (mirrors api-idp), OperadorAlmacen Warehouse Scope.

---

## Migrations

- `20260727200000_add_company_and_company_user` (001, additive: creates `company`/`company_user`, seeds one implicit company, backfills `company_user.role` bit-for-bit from `app_user.roles`).
- `20260728140000_drop_app_user_roles` (002, BREAKING: drops `app_user.roles` — ships only after 001's backfill was verified via `verify-company-user-backfill.ts`).
- **Neither migration has ever been applied to the dev database `store_mgmt`** — only to `store_mgmt_test`. Whoever picks up this branch on a real environment MUST run both migrations against `store_mgmt` before relying on the new authorization model there.

## Owner Decisions Recorded

- Implicit company name: **`Tienda Prueba`** (final; superseded the design-time placeholder `Tienda Principal`). Slug stays **`default`** (lookup key, not display text). Applied in lockstep to `infra-db/src/company/seed.ts` and migration 001's INSERT — drifting them would give a seeded DB and a backfilled DB two different companies under one slug.

## Plan Bugs Found During Apply (4, all one class)

All four were the same failure class — **a phase deferring work that its own gate depends on**. All four are recorded with full detail in `tasks.md` in this folder:
1. Phase 1 gate (migration 001 + verify script) depended on work items that a later phase description implied were deferred.
2. Phase 2's cutover depended on the mapper fix (`user.mapper.ts`) which the original task wording under-scoped.
3. Phase 2's `UsersController.list()` needed `@Req()` plumbing that the original tasks.md flagged as an open question rather than a concrete task — resolved during apply.
4. Phase 3's fixture migration depended on the §7 backfill gate being re-confirmed AFTER fixture changes, not just before — sequencing was implicit, not stated as its own task.

(See `tasks.md` for the exact task numbers and resolutions; not re-derived here to avoid drift from the authoritative record.)

## Accepted Deviation

Design §9 test-plan row 11: no permanent spec exists around `verify-company-user-backfill.ts` (the backfill-verification script). Accepted and recorded in `design.md` rather than silently diverging — this was verify-report W3, closed by acceptance rather than by a code fix.

## Known Follow-Ups NOT Done In This Change

1. **`tsconfig.json` excludes `**/*.spec.ts` in every package** — no spec file is type-checked anywhere in the monorepo. This is what let a stale `roles` reference survive the compile-error sweep during apply (verify-report W2). Recommend a dedicated follow-up change to fix the tsconfig `include`/`exclude` so spec files are type-checked, or add an explicit CI step that runs `tsc --noEmit` over spec files.
2. **`docs/system/architecture.md:67,143-152` is stale** — still describes `infra-db` as "(future)" and the HTTP backend as "does not exist", while `api-idp`/`api-salesops`/`infra-db`/`api-common` are all shipped. Flagged in both the proposal and design as doc debt, not fixed here.

---

## Traceability — Engram Observation IDs

| Artifact | Topic Key | Observation ID | Type |
|---|---|---|---|
| Proposal | `sdd/company-user-roles-reframe/proposal` | #1564 | architecture |
| Spec (delta) | `sdd/company-user-roles-reframe/spec` | #1565 | architecture |
| Design | `sdd/company-user-roles-reframe/design` | #1567 | architecture |
| Tasks | `sdd/company-user-roles-reframe/tasks` | #1568 | architecture |
| Verify Report | `sdd/company-user-roles-reframe/verify-report` | #1594 | architecture |
| Archive Report | `sdd/company-user-roles-reframe/archive-report` | (this document) | architecture |

---

## Archive Destination and Known Limitation

**Planned destination** (per the repo's existing convention — every prior archived change lives at `openspec/changes/archive/YYYY-MM-DD-{change-name}/`, e.g. `2026-07-14-salesops-12-commission-liability/`):

```
openspec/changes/company-user-roles-reframe/
  → openspec/changes/archive/2026-07-28-company-user-roles-reframe/
```

**KNOWN LIMITATION — the physical move was NOT executed by this sub-agent.** This execution environment provided no Bash/shell tool (only `Read`, `Edit`, `Write`, `Glob`, and Engram MCP tools). Given the explicit prior-incident warning that a copy-and-rewrite archive pass silently corrupted `proposal.md` (234 of 361 lines lost), and given the instruction that ONLY `git mv` — never a manual read/rewrite — may be used to relocate this folder, I did not attempt a Read+Write round-trip of the 7 pre-existing files (`explore.md`, `proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, `specs/salesops-companies/spec.md`, `specs/salesops-identity/spec.md`). A `Write` tool round-trip risks undetectable byte-level drift (trailing newline, whitespace) that would fail your `diff -rq` check, and could not be verified from inside this sandbox.

This `archive-report.md` was written directly INTO the still-in-place `openspec/changes/company-user-roles-reframe/` folder specifically so a single subsequent `git mv` of the whole directory carries it along atomically with everything else, matching how every other archived change in this repo bundles its own `archive-report.md`.

**Action required** (run with actual shell/git access, not from this sub-agent):

```bash
git mv openspec/changes/company-user-roles-reframe openspec/changes/archive/2026-07-28-company-user-roles-reframe
```

This is a pure rename — it will move all 8 files (including this report) as one atomic operation with zero content rewriting, satisfying the anti-corruption requirement exactly. Per your instructions, no commit was made; the working tree is left with:
- Modified: `openspec/changes/backend-users-roles/specs/salesops-identity/spec.md` (delta merged in place)
- New file: `openspec/specs/salesops-companies/spec.md`
- New file: `openspec/changes/company-user-roles-reframe/archive-report.md`
- Pending (not yet executed): the `git mv` above

---

## SDD Cycle Status

Planning, implementation, and verification are complete and PASS. Spec merge into the two main-spec targets is complete. The only remaining step — physically relocating the change folder into the archive tree via `git mv` — requires shell access this sub-agent does not have, and is queued as the single action item above.
