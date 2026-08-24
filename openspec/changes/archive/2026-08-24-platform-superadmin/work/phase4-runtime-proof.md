# Phase 4 Runtime Proof — platform-superadmin

Date: 2026-08-24 · HEAD: `e37deee` · web-catalog restarted fresh at :3900 before proof; api-salesops/api-idp/api-public processes started 14:41–14:42 (> HEAD time 14:04).

## Method

Real `Host` headers via `curl --resolve <host>:3900:127.0.0.1` (no `X-Forwarded-Host` faking). Hosts used: `admin.localhost`, `default.localhost` — Vite dev allowlist admits `.localhost`; both satisfy the app grammar (`labels[0]`, ≥2 labels).

## Test setup (disclosed)

Seeded user `admin` has `is_superadmin=true` set DIRECTLY in master DB (`UPDATE app_user SET is_superadmin=true WHERE login='admin'`) — already true when this batch started (a prior phase flipped it the same way). No seeded data deleted; new test rows: company slug `phase4-proof-store`, owner login `phase4.owner` — left in place per hygiene rules.

## Task 4.2 — D4 host×path matrix (all five cells)

| # | Host | Path | Expected | Observed |
|---|------|------|----------|----------|
| 1 | default (tenant) | `/tiendas` | generic 404 | **404** |
| 2 | default | `/` | unchanged tenant behavior | **200** storefront |
| 2b | default | `/productos` | unchanged | **200** catalog |
| 3 | admin | `/` | redirect `/tiendas` | **302 → http://admin.localhost:3900/tiendas** |
| 4 | admin | `/productos` | redirect `/tiendas` | **302 → /tiendas** |
| 5a | admin | `/tiendas` anon | login redirect | **302 → /admin/login?returnTo=%2Ftiendas** |
| 5b | admin | `/tiendas` superadmin session | platform shell serves | **200**, `data-testid="platform-shell"` present; table lists `phase4-proof-store`, `Tienda Prueba` (default), `tienda-runtime` with columns Nombre/Slug/Tipo/Estado |
| 5c | admin | `/tiendas/nueva` superadmin session | form renders | **200**: Nombre, slug, type option `catalog` only, temporary-password label present |

Cell 1 nuance (documented honestly): tenant-host `/tiendas` 404 body is NOT byte-identical to an unknown-path 404 (120,202 vs 3,779 bytes). The delta is exclusively React Router dev-server hydration payload (modulepreload tags + embedded route manifest for the statically matched route). User-visible content IS identical: same `<h1>404</h1><p>La página que buscás no existe.</p>` boundary, same status. Leak checks on the 120 KB body: NO `platform-shell` markup, NO company slugs/names, NO `temporaryPassword`. This matches the spec requirement ("reveals nothing") and the unit-test assertion level (rendered UI identity, `platform-host.test.tsx`).

### Cookie isolation (admin-host cookie never reaching tenant subdomains)

Login form POST on `admin.localhost` → `Set-Cookie: __store_session=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`.

- **No `Domain` attribute** in Set-Cookie → RFC 6265 host-only cookie, scoped to exactly `admin.localhost`.
- curl cookie jar stores it as `#HttpOnly_admin.localhost`.
- Request to `default.localhost` WITH that jar attached: curl sends **no Cookie header at all** (domain mismatch). Verified on the wire (`> Cookie:` absent in verbose trace).

## Task 4.3 — No-password-retrieval proof

Flow: superadmin `admin` logged into api-idp (:4902) → `POST /platform/companies` `{name:"Tienda Fase 4 Proof", slug:"phase4-proof-store", type:"catalog", ownerLogin:"phase4.owner", temporaryPassword:"TempFase4!2026"}` → response `{company:{id,name,slug,type},ownerLogin,temporaryPassword}` (plaintext shown exactly once).

1. **Server logs contain no password**: grep of `dev-logs/idp.log` and `dev-logs/web.log` for the plaintext: **0 hits / 0 hits**.
2. **No later endpoint returns it**: subsequent `GET /platform/companies` contains neither key `temporaryPassword` nor the plaintext string (**false/false**); items shaped `{id,name,slug,isActive,type}` only.
3. **DB holds only bcrypt hash**: `app_user` row for `phase4.owner`: `password_hash` prefix `$2b$10$` (bcrypt cost 10); hash does NOT contain plaintext; `bcrypt.compare(temp, hash)` → **true**; app_user has no other password column. Company row: `slug=phase4-proof-store, type=catalog, is_active=true`.
4. **Owner logs in with displayed temp password**: `POST /auth/login` with `phase4.owner` / temp password → **HTTP 200** + tokens.

Bonus runtime gate evidence: unauthenticated `GET /platform/companies` → **401**; valid non-superadmin session → **403**.

## Task 4.1 — Gates

`pnpm turbo run lint typecheck test --force`: **42/42 tasks successful**, exit 0. Per-package tests: infra-db 439, domain 32 files, infra-storage 25, api-common 47, api-public 62, api-idp 92, api-salesops 538, web-catalog 33 files, web-common/storefront/static-store/salesops-mvp all green. Lint within budgets (static-store 5/≤5 warnings, salesops-mvp 3/≤3 pre-existing, untouched by this change).

Coverage ratchet (`test:cov --force` on touched packages), all pass, no threshold regressions:

| Package | Lines % |
|---|---|
| infra-db | 94.11 |
| api-common | 92.70 |
| api-idp | 93.73 |
| domain | 89.32 |
| web-catalog | 86.70 |

## Task 4.4 — Diff audit

Base = pre-change tree `14052c7`, target = HEAD `e37deee`.

| Artifact | Verdict |
|---|---|
| `templates/apps/api-idp/src/company/dto/create-company.dto.ts` | **UNTOUCHED** (empty diff) |
| `templates/apps/api-idp/src/company/create-company.saga.ts` | **UNTOUCHED** (empty diff) |
| `templates/apps/api-idp/src/company/company.controller.ts` (self-service `POST /companies`) | **UNTOUCHED** (entire file empty diff) |

Only `company/*` files changed in the whole range: `create-company.saga.spec.ts` (**fixture-only**: test company literal gains `type: 'catalog'` required by the widened domain factory — saga logic/assertions untouched) and `prisma-company.repository.ts` (+4/-… enum mapping for the new column).

**JWT payload stays `{sub, login}`** — decoded live superadmin access token:

```json
{"sub":"4613d373-3177-445a-8dbe-3ca9f3a2374b","login":"admin","iat":1787597594,"exp":1787598494}
```

No `roles` / `companyId` / `isSuperadmin` claim. (Owner token decoded identically during 4.3 step 4.)
