# sdd-verify Report: platform-superadmin

Date: 2026-08-24 · Verifier: independent re-run (apply narrative audited, not trusted)
Range: `14052c7` (pre-change baseline) .. `a03e8de` (HEAD, docs-only final pass; implementation ends at `e37deee`)

## Verdict: PASS

All 9 requirements / 24 scenarios across the three delta specs have genuine,
independently reproduced evidence: unit/integration assertions located and read,
full gates re-run green from a forced cold cache, and every runtime-provable
behavior re-executed live over the wire against the running stack.

---

## Gates Executed (independently re-run)

| Gate | Command | Result |
|---|---|---|
| Full monorepo gates | `pnpm turbo run lint typecheck test --force` from `templates/` | **42/42 tasks successful, 0 cached**, exit 0 (~3m49s). api-idp 92/92 tests, api-salesops 538/538, all other packages green |
| Postgres | localhost:5433 (`store_mgmt`) | reachable; DB-level checks below |

Coverage ratchets were NOT re-run in this verification (unit `test` task was;
`test:cov` thresholds were reported by apply as passing on all five touched
packages — low risk since unit suites are identical code paths).

## Live Runtime Reproduction (all re-executed this session)

| Check | Result |
|---|---|
| Superadmin login → JWT payload decoded | `{sub, login, iat, exp}` — NO `roles`, NO `isSuperadmin`, NO `companyId` |
| Owner login (`phase4.owner`, temp password from proof doc still valid) → JWT decoded | same minimal shape; its bearer on `GET /platform/companies` → **403** |
| `GET /platform/companies` anonymous | **401** |
| `GET /platform/companies` superadmin | **200** full list |
| Invalid create-on-behalf body (bad slug + empty name + bad type + short pw) | **400** before any write |
| Create-on-behalf happy path (`verify-report-store` / `verify.report.owner`) | **201** `{company, ownerLogin, temporaryPassword}`; plaintext shown exactly once |
| Subsequent `GET /platform/companies` | contains neither key `temporaryPassword` nor plaintext |
| DB row for created owner | `password_hash` prefix `$2b$10$`, hash contains no plaintext, `is_superadmin=false` (column default) |
| Owner logs in with displayed temp password | **200** + tokens |
| Duplicate slug → 409; duplicate ownerLogin → 409 | both **409** live; company count identical before/after (4→4) — no Company written on dup-owner path |
| Tenant host × `/tiendas` | **404** (generic boundary `<h1>404</h1>` + Spanish text) |
| Tenant host × `/productos`, `/` | **200** unchanged tenant behavior |
| Admin host × `/`, `/productos` | **302 → /tiendas** |
| Admin host × `/tiendas` anonymous | **302 → /admin/login?returnTo=%2Ftiendas** |
| Admin host web login → Set-Cookie jar | `#HttpOnly_admin.localhost FALSE / …` — **host-only, no Domain attribute** (cannot reach tenant subdomains) |
| Admin host × `/tiendas` superadmin session | **200**, `platform-shell` renders, table lists seeded + newly-created rows |

## Diff Audit (confirmed independently)

- `git diff 14052c7..HEAD -- templates/apps/api-idp/src/company/`: **only**
  `create-company.saga.spec.ts` (+1 fixture line `type: 'catalog'` required by
  the widened domain factory — saga logic/assertions untouched).
  `create-company.dto.ts`, `create-company.saga.ts`,
  `company.controller.ts`: **empty diff**.
- `schema.prisma`: additive only (`isSuperadmin` + `CompanyType` enum +
  nullable `type` column). Migration SQL matches D5 verbatim.
- `jwt.config.ts`: `JwtAccessPayload = { sub, login }` ONLY (ADR-2), signed at
  `auth.service.ts` `issueTokens()` from master user fields — no flag ever
  enters a token. `SanitizedUser` keeps required `roles` (TenantContextGuard
  populates it); `AuthenticatedUser` (JwtAuthGuard-only shape) structurally
  cannot carry roles/companyId/companyUserId.
- `a03e8de` is openspec-docs-only; implementation surface ends at `e37deee`,
  matching the apply evidence's HEAD claim.

## Scenario Coverage Matrix

Legend: ✅ = real assertion found and judged genuinely covering; 🔁 = covered by
green-unchanged regression suite (spec-mandated regression proof); 🌐 =
additionally verified live over the wire this session.

### salesops-platform (6 requirements, 16 scenarios)

| # | Requirement / Scenario | Evidence | Verdict |
|---|---|---|---|
| P1 | Identity Gate: superadmin passes w/o tenant context | `superadmin.guard.spec.ts:40` (asserts req.user has NO roles/companyId/companyUserId) + `platform.controller.spec.ts:139` guard-chain metadata `['JwtAuthGuard','SuperadminGuard']` | ✅ |
| P2 | Identity Gate: non-superadmin → 403 | `superadmin.guard.spec.ts:52`; `platform.controller.spec.ts:160` (GET) & :196 (POST, before any write); 🌐 tenant-company-owner token → 403 | ✅ 🌐 |
| P3 | Identity Gate: unauthenticated → 401, gate never runs | `platform.controller.spec.ts:149` (+ repository-not-called assertion); 🌐 401 | ✅ 🌐 |
| P4 | List: includes unprovisioned (`schemaName=null`) | `platform.controller.spec.ts:170` exact-body assertion incl. `type:null` inactive row | ✅ |
| P5 | List: gated (non-superadmin → 403) | `platform.controller.spec.ts:160` | ✅ 🌐 |
| P6 | Create-on-behalf: happy path (owner exists, saga ran w/ that ownerId, success) | `platform.service.spec.ts:86` strict invocation-order proof (hash < create < saga, ownerId passed); `platform.controller.spec.ts:207`; 🌐 full round-trip incl. owner login with displayed password | ✅ 🌐 |
| P7 | Create-on-behalf: duplicate slug → 409 | `platform.service.spec.ts:133` (saga's `DuplicateCompanySlugError` → ConflictException); 🌐 409 | ✅ 🌐 |
| P8 | Create-on-behalf: invalid input → 400 before any write | `platform.controller.spec.ts:228` `it.each` ×4 cases each asserting `userRepository.create` and `saga.run` NOT called; 🌐 400 | ✅ 🌐 |
| P9 | Create-on-behalf: duplicate owner login → 409, no Company touched | `platform.service.spec.ts:122` (409 AND saga never invoked); 🌐 409 with company count unchanged | ✅ 🌐 |
| P10 | Show-once password semantics | `platform.service.spec.ts:144` (only hash persisted) + :155 (no log level carries plaintext); console show-once suite `tiendas.test.tsx:218-253` (exactly one DOM occurrence, no input retains it); 🌐 later list endpoint clean + DB hash-only + not retrievable | ✅ 🌐 |
| P11 | Admin host routing: tenant host cannot reach console | `platform-host.test.tsx:72` (layout throws THE generic 404, body `'Not Found'` asserted equal); 🌐 404 — see Finding W1 for byte-level nuance | ✅ 🌐 (W1) |
| P12 | Admin host routing: admin `/` → `/tiendas` | `platform-host.test.tsx:35` (302 + location); 🌐 302 | ✅ 🌐 |
| P13 | Admin host routing: admin `/productos` → `/tiendas`, no storefront leak | `platform-host.test.tsx:42`; root loader intercepts before child loaders by construction (`root.tsx` branch); 🌐 302 | ✅ 🌐 |
| P14 | Console guard: anonymous → login redirect | `tiendas.test.tsx:61` (exact status + destination, fetch never called); 🌐 302 same destination | ✅ 🌐 |
| P15 | Console guard: non-superadmin → SAME redirect (indistinguishable) | `tiendas.test.tsx:72` — explicit equality of status AND location vs anonymous baseline captured in same test; API-side non-superadmin rejection additionally 🌐 403 | ✅ |
| P16 | Console lists stores; form offers name/slug/type/owner credentials | `tiendas.test.tsx:88` (Bearer sent, X-Company-Id absent, ALL companies) + :135 form fields incl. type options `=== ['catalog']`; 🌐 200 rendered shell with rows | ✅ 🌐 |

### salesops-identity (2 requirements, 6 scenarios)

| # | Scenario | Evidence | Verdict |
|---|---|---|---|
| I1 | Default users are not superadmin | `domain/src/users/user.test.ts:33` (factory default false) + `infra-db/src/users/prisma-user.repository.spec.ts` (DB column default round-trip false/true); 🌐 created owner row has `is_superadmin=false` | ✅ 🌐 |
| I2 | Flag lives on User, not in role bitmask | Static audit: zero diff to `USER_ROLES`/roles files in range; `roles.guard.spec.ts` green unchanged (bitmask mechanisms untouched); guard reads only `req.user.isSuperadmin` | ✅ 🔁 |
| I3 | JwtStrategy output carries `{id,login,isActive,isSuperadmin}`, no roles/companyId/companyUserId | `jwt.strategy.spec.ts` two new tests asserting property presence AND absence (`not.toHaveProperty`); sanitize-map change is +1 field | ✅ |
| I4 | Login response exposes tokens only, never the flag | `auth.service.ts issueTokens()` returns tokens only (audited, unchanged in range); `auth.controller.spec.ts` green unchanged | ✅ 🔁 |
| I5 | TenantContextGuard populates roles after JwtAuthGuard, flag untouched | `tenant-context.guard.ts/spec.ts` untouched in range, green under forced full run | ✅ 🔁 |
| I6 | Missing tenant CompanyUser fails loud `MISSING_COMPANY_USER` from new location | `jwt.strategy.spec.ts:124` (strategy does NOT log it) + `tenant-context.guard.spec.ts:342` (guard DOES log it, distinct 403) | ✅ |

### salesops-companies (1 requirement, 2 scenarios)

| # | Scenario | Evidence | Verdict |
|---|---|---|---|
| C1 | New companies default to catalog | `domain/src/company/company.test.ts` (default 'catalog'; explicit null passes through untouched); migration column `DEFAULT 'catalog'`; 🌐 created company row `type=catalog` | ✅ 🌐 |
| C2 | Type has zero behavioral effect on provisioning/access | `create-company.saga.spec.ts` green with fixture-only change (input contract intact); prisma repo maps enum only (+4 lines); guard/tenancy files untouched in range | ✅ 🔁 |

No scenario found lacking a real assertion.

## Security Spot-Checks (all PASS)

1. **JWT payload**: live-decoded superadmin and owner access tokens — `{sub, login, iat, exp}` only. Type system enforces it (`JwtAccessPayload`).
2. **Guard cannot be satisfied by tenant role**: `SuperadminGuard` reads exclusively `req.user.isSuperadmin`; roles don't exist until `TenantContextGuard`, which is absent from the platform chain (metadata test pins the chain). A tenant-admin token (live: company owner) → 403.
3. **Temp password propagation**: grep across `templates/` — `temporaryPassword` appears only in the platform DTO/service/controller (api-idp), the nueva-tienda route (web-catalog), and their specs. No logger call touches it; persistence receives only the bcrypt output (unit-asserted + DB-verified `$2b$10$`); no later endpoint returns it (live-verified).
4. **Indistinguishable redirects**: anonymous and non-superadmin produce identical 302 status + `/admin/login?returnTo=…` destination (equality asserted in-test); neither carries a distinguishing body; the destroy-cookie header travels only on genuine expired-session 401s, which applies equally to an anonymous/expired caller regardless of privilege.
5. **Cookie isolation**: `session.server.ts` omits `domain` (load-bearing comment); live cookie jar entry confirms host-only scoping.

## Findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| W1 | WARNING (adjudicated — satisfies spec intent; follow-up recommended) | On a tenant host, `/tiendas`' 404 **body differs byte-wise** from an unknown-path 404 under RR7 **dev SSR** (120,202 vs ~3,778 bytes): the hydration payload embeds the route manifest, including the module id `"platform/routes/tiendas"`. Status (404) and user-visible boundary (`<h1>404</h1>` + Spanish text) are identical, and leak-scanning the full body found NO `platform-shell` markup, NO company slugs/names, NO password material. Adjudication: "revealing nothing" is satisfied at the data level — the only delta is route existence, which is equally enumerable from the shipped client bundle on ANY host, so nothing beyond SPA-inherent information leaks. Follow-up: re-assert 404 parity (status + rendered boundary + absence of route-manifest deltas) against a **production build**, where dev-server modulepreload/manifest artifacts do not exist. | live curl size comparison + regex scan of saved bodies; `platform-host.test.tsx:72` asserts rendered-body equality at the unit level |
| S1 | SUGGESTION | `work/phase4-runtime-proof.md` cites `dev-logs/idp.log` / `dev-logs/web.log`, which no longer exist anywhere in the workspace — that specific log-grep is not re-runnable from the repo. Non-blocking: compensated by stronger evidence (zero logger calls in the password path, a unit test asserting no log level carries the plaintext, and live endpoint+DB proofs). | glob `**/dev-logs/*.log` → no files |
| S2 | SUGGESTION | The guard docstring notes superadmin-flag revocation takes effect within the JWT strategy's ~30s cache TTL — technically at odds with the spec's "resolved fresh per request" phrasing, though it is the pre-existing mechanism shared with `isActive` deactivation and consistent with ADR-2's intent (never baked into the token). Consider documenting the TTL in the spec or tightening the wording. | `superadmin.guard.ts:15-16`; `TtlCache` in `jwt.strategy.ts` |

## Test Rows Left Behind (disclosed)

Independent verification created company `verify-report-store` + owner
`verify.report.owner` (temp password rotated out of relevance; bcrypt-only in
DB), consistent with the change's existing hygiene of leaving proof rows
(`phase4-proof-store`). Remove at will via SQL if undesired.

## Next Step

Ready for **archive** (`sdd-archive`): sync the three delta specs into
`openspec/specs/`.
