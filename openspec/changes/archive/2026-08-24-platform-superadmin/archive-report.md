# Archive Report — platform-superadmin

**Date**: 2026-08-24
**Verdict**: ARCHIVED — cycle closed.
**Artifact store**: openspec (filesystem only). No Engram observations; all artifacts live in this archived folder.

## What Shipped

- **Master `User.isSuperadmin` flag** (`is_superadmin BOOLEAN NOT NULL DEFAULT false`) + migration — master-level platform authorization fact, independent of the `USER_ROLES` bitmask and of any `Membership`.
- **`Company.type` metadata field** — nullable, backed by master `"CompanyType"` enum (only value today: `'catalog'`), column default `'catalog'`. Data only: provisioning saga input contract (`name`, `slug`, `ownerId`) untouched.
- **SuperadminGuard + `/platform/companies` endpoints** — list companies and create-on-behalf, composing the owner-creation flow with the existing `CreateCompanySaga` left untouched.
- **web-catalog admin-host console** — `/tiendas` (list) and `/tiendas/nueva` (create on behalf) with a show-once temporary password.

## Verification Summary

Per `verify-report.md`: **verdict PASS — 0 CRITICAL / 1 WARNING / 2 SUGGESTIONS.**

- **W1 (adjudicated)**: dev-SSR 404 response body nuance. Recommendation carried forward: re-check under a production build before any public deploy.
- **Suggestions**: 30s JWT cache TTL means flag revocation can lag up to ~30s behind the database; plus one further non-blocking suggestion in the report.

## Commits Lineage

`4e4ce9b..fa11b4b` — 15 commits, including recovery from an interrupted attempt.

## Native Attempt Ledger Note

Attempt 1 was interrupted by a network failure after phases 1–3. Owner approved a reset; attempt 2 re-ran cleanly and passed. The interrupted attempt is recorded here as history only — no unresolved state carries into this archive.

## Test Rows Disclosed in DB

Test rows exist in the development database: stores `phase4-proof-store`, `verify-report-store`, and their owner users. These are dev-only fixtures and were not cleaned up by design (verification evidence).

## Spec Sync Performed

| Domain | Action | Details |
|--------|--------|---------|
| salesops-platform | Created | New master spec copied mechanically from delta |
| salesops-identity | Updated | ADDED "Platform Superadmin Flag on Master User"; MODIFIED "Role Resolution at Authentication Time" replaced wholesale |
| salesops-companies | Updated | ADDED "Company Type Metadata Field" |

Audit tool (`openspec/tools/audit-spec-merges.py`) after merge: 12 open items, all belonging to the separate `delivery-hardening` change — zero open items for `platform-superadmin`.

## Gates

- Task Completion Gate: PASS — tasks.md 16/16 checked, 0 unchecked at archive time.
- Verification gate: PASS — no CRITICAL issues.
- Native Review Receipt Gate: `reviewGate` structurally absent — no review artifact discovered for this candidate; archive proceeded under ordinary repository policy.
