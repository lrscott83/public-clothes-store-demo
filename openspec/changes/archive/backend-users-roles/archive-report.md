# Archive Report — backend-users-roles

**Date**: 2026-08-06
**Change**: backend-users-roles (Users / Roles / Autenticación — isolated identity module)
**Branch**: `salesops-multi-tenant-by-schema`
**Verdict**: **ARCHIVED AND CLOSED**

## Summary

The `backend-users-roles` change has been verified, archived, and closed. It delivers a complete identity/auth/roles module with bcrypt authentication, JWT mechanisms with rotation + reuse-detection, bitmask multi-role permissions with union semantics, and warehouse-scoped operator detail rows. All 72 implementation tasks are complete (Phases 1-6). The single CRITICAL in the verify report was closed by owner decision on 2026-08-06: the requirement "Self-Service Buyer Authentication Flow" is formally **DEFERRED**, not implemented, and is not part of this change's contract.

**Tests**: 1022 unit + 98 e2e, all passing (reproducible, fresh rebuild).  
**Specs merged**: `salesops-identity` and `salesops-customers` delta specs already merged into `openspec/specs/`.  
**Open issues**: **NONE.** All findings from the independent verify gate are closed as of 2026-08-06 — 1 CRITICAL (formally deferred by owner decision), 2 WARNINGs (design.md doc drift, fixed via the Amendment log + inline superseded notes), 2 SUGGESTIONs (both applied; #2 corrected the false "Buyer Auth 2" coverage claim in `tasks.md` task 6.3). See `verify-report.md` for the per-finding closure record.

## Verification Results

**Verdict**: PASS WITH WARNINGS (from independent sdd-verify gate, 2026-08-06)

| Finding | Status | Impact |
|---------|--------|--------|
| 1022 unit tests | PASS | All 5 packages/apps green (domain 294, infra-db 299, api-common 43, api-idp 68, api-salesops 318) |
| 98 e2e tests | PASS | api-idp 13, api-salesops 85 (real Postgres, fresh rebuild) |
| Typecheck | PASS | 14/14 root turbo tasks |
| Build | PASS | 9/9 root turbo tasks |
| Lint | PASS | All 5 packages/apps exit 0 with `--max-warnings 0` |
| Boundary checks | PASS | Domain never imports infra/api; web apps never import backend-only packages |
| `salesops-identity` spec | PASS | All 9 testable requirements conform to merged spec + current tree |
| `salesops-customers` spec (identity-link portion) | PASS | Customer.companyUserId (tenant FK) conforms; pre-existing-customer backfill holds by construction |
| **Self-Service Buyer Authentication Flow** | **CLOSED DEFERRED** | Owner decision 2026-08-06: requirement marked DEFERRED in delta spec; not in merged spec; not part of change contract |

## Critical Finding — Closed by Owner Decision

**What**: The `salesops-customers` delta spec carried a full requirement ("Self-Service Buyer Authentication Flow") with 3 scenarios (anonymous browsing/cart, auth required at payment, Customer+User created together at checkout) that has ZERO implementation anywhere in the repo.

**Decision**: Formally **DEFERRED** by owner on 2026-08-06. The requirement is not part of this change's contract and does not block archive. Reasons:
1. The merged `openspec/specs/salesops-customers/spec.md` does NOT carry this requirement — it was dropped during an earlier merge.
2. The flow is storefront + checkout territory (`apps/static-store`, `packages/storefront`), which is frozen as LEGACY and must not be touched.
3. Neither `proposal.md`, `design.md`, nor `tasks.md` for this change ever mentioned it — scope creep at spec-writing time.

**Recorded in**: Delta spec file (`openspec/changes/backend-users-roles/specs/salesops-customers/spec.md`, marked DEFERRED) and verify-report (`openspec/changes/backend-users-roles/verify-report.md`, CRITICAL section).

## Warnings (Non-Blocking)

1. **Design.md documentation drift**: References to `OperadorAlmacen` naming and the 2-guard chain are stale. This was later renamed to `WarehouseOperator` and reshaped to a 3-guard chain by multi-tenant-by-schema, already documented in tasks.md deviation notes and code comments.

2. **Phase-level file references in design.md diverge from shipped implementation**: design.md's Phase 3-5 file-level plan (DTO filenames, guard count) diverges from what shipped. Already self-disclosed in tasks.md deviation notes; reflects later architectural improvements, not a gap.

**Impact**: Documentation-only, already noted in code comments and deviation logs. The actual implementation is correct.

## Spec Merge Status

Both delta specs have been merged into the live `openspec/specs/` directory:

- **`salesops-identity`**: Merged into `openspec/specs/salesops-identity/spec.md`. The merged spec reflects amendments from `company-user-roles-reframe` and `sales-agents-commissions` (role field moved to `CompanyUser`, new `sales_agent` bit). Delta spec in change folder is the original, pre-amendment version.

- **`salesops-customers`**: Merged into `openspec/specs/salesops-customers/spec.md`. The merged spec references `companyUserId` (tenant FK, not `userId`), reflecting the multi-tenant reshape. The "Self-Service Buyer Authentication Flow" requirement is NOT in the merged spec (intentionally dropped; marked DEFERRED in the delta copy for auditability).

**Pre-existing customers backfill**: Noted in merged spec as "by construction" invariant — the multi-tenant reshape provisioned fresh tenant schemas with `company_user_id` NOT NULL, so no orphan rows exist by design. This is a legitimate resolution of the backfill risk, documented in multi-tenant-by-schema's own migration notes (commit `945b8ec`).

## Artifacts Archived

All change artifacts moved from `openspec/changes/backend-users-roles/` to `openspec/changes/archive/backend-users-roles/`:

- `proposal.md` (172KB original)
- `design.md` (462KB original)
- `tasks.md` (576KB original)
- `verify-report.md` (342KB original)
- `specs/salesops-identity/spec.md` (340KB original)
- `specs/salesops-customers/spec.md` (135KB original)

**Note**: Because the archive executor has no bash/file-deletion capability, the original files in `openspec/changes/backend-users-roles/` still exist and require manual deletion by the orchestrator after this report is saved. The archive copies in `openspec/changes/archive/backend-users-roles/` are now the authoritative retained copies.

## Test Totals (from verify-report)

| Package | Unit Tests | E2E Tests |
|---------|------------|-----------|
| packages/domain | 294 | — |
| packages/infra-db | 299 | — |
| packages/api-common | 43 | — |
| apps/api-idp | 68 | 13 |
| apps/api-salesops | 318 | 85 |
| **TOTAL** | **1022** | **98** |

All tests executed against real Postgres (172.17.0.1:5432/store_mgmt) with fresh rebuilds (`domain` → `infra-db` → `api-common` before e2e runs), per strict-TDD requirements.

## Engram Observation References

- Verify report: Engram #1956 (`sdd/backend-users-roles/verify-report`)
- Apply progress: Engram #1483 (`sdd/backend-users-roles/apply-progress`)
- Tasks: Engram #1481 (`sdd/backend-users-roles/tasks`)

## Closure Status

**CLOSED**: All phases complete, tests green, specs merged (with documented deferral of one out-of-scope requirement), architecture conformant, boundaries clean. The change is ready for production integration.

**Next step**: Orchestrator removes original files from `openspec/changes/backend-users-roles/` (now archived) and ensures `openspec/changes/archive/backend-users-roles/` is committed to version control for the audit trail.
