# Design: Platform Superadmin Console

## Technical Approach

Boolean `is_superadmin` on master `app_user` + nullable `company.type` in ONE additive master migration. api-idp gains an app-local `platform/` module: a dedicated `SuperadminGuard` reading `req.user.isSuperadmin` after `JwtAuthGuard` alone (RolesGuard hard-fails tenant-less by design, `roles.guard.ts:37-72`), plus `GET/POST /platform/companies` where the ENDPOINT layer composes owner-user creation (bcrypt cost 10, `users.service.ts:23`) with the UNTOUCHED `CreateCompanySaga`. web-catalog branches in the ROOT loader on reserved label `admin` and serves `/tiendas`, `/tiendas/nueva` under a new `_platform.tsx` layout with a session-only guard. Maps to specs `salesops-platform` / `salesops-identity` / `salesops-companies`.

## Architecture Decisions

### D1: SuperadminGuard lives app-local in api-idp
| Option | Tradeoff |
|---|---|
| api-common (`src/auth/`) | Shared like RolesGuard/TenantContextGuard — but those earn their place via multi-app consumers (api-idp AND api-salesops); today exactly one consumer exists |
| **api-idp `src/platform/superadmin.guard.ts`** | No public-package widening; promote to api-common later if a second app needs it |

**Choice**: app-local. **Rationale**: single boolean check, single consumer — YAGNI; moving it later is mechanical.

### D2: List endpoint returns full array, no pagination
**Choice**: `GET /platform/companies` → all companies via existing `ICompanyRepository.list()` (`company-repository.port.ts:15`). **Rationale**: spec mandates ALL companies including inactive/unprovisioned; tenant counts are small; pagination adds params + UI state for zero benefit.

### D3: Create-on-behalf composition order (endpoint layer)
Validate DTO → `bcrypt.hash(pw, 10)` → `userRepository.create` (`DuplicateLoginError` → 409, saga NEVER invoked) → `createCompanySaga.run({ name, slug, ownerId })` → respond `{ company, temporaryPassword }` once. Saga stays byte-for-byte untouched (input contract `{name, slug, ownerId}`, `create-company.saga.ts:25-30`). **Orphan-owner stance**: documented harmless (spec text) — mirrors `UsersService.create`'s explicit precedent (`users.service.ts:69-72`: a User with no Membership "cannot authenticate anywhere"). No compensation code added.

### D4: Host branching in the ROOT loader; `_platform` as sibling layout
`tenant.server.ts` gains `isPlatformAdminHost(request)` (`labels[0] === 'admin'`). `root.tsx` loader:

```
admin host?
├─ yes → path starts with /tiendas ? { platform: true }   (skip StoreConfig)
│        └─ else → redirect('/tiendas')
└─ no  → resolveStoreConfig(request)                       (unchanged, tenant 404 preserved)
```

Root loader runs BEFORE child loaders, so `admin.<host>/productos` (which statically matches the tenant `/productos` route) is intercepted before any tenant resolution. Defense-in-depth: the `_platform.tsx` layout loader independently throws the SAME generic 404 as `store-config.server.ts:20` when the host is NOT admin — so a tenant host hitting `/tiendas` reveals nothing.

Host × path matrix:

| Host | Path | Result |
|---|---|---|
| tenant | `/tiendas` | generic 404 (from `_platform` layout) |
| tenant | any | unchanged tenant behavior |
| admin | `/` | redirect → `/tiendas` |
| admin | `/productos` (any non-`/tiendas`) | redirect → `/tiendas` |
| admin | `/tiendas`, `/tiendas/nueva` | platform layout serves |

Routes register in `routes.ts` as a SIBLING branch outside `_auth.tsx` (mirrors `admin/login` pattern, `routes.ts:8-12`): `layout('_platform.tsx', [index→redirect helper? no — '/' handled by root loader, route('tiendas'), route('tiendas/nueva')])`. Cookie isolation needs NO code: `domain` is intentionally omitted (`session.server.ts:41-45`), so the `__store_session` cookie on `admin.<host>` never reaches tenant subdomains. `App` renders a minimal platform shell when `loaderData.platform` (Header/Footer require a `StoreConfig` that doesn't exist here).

### D5: Single additive master migration
`migrations/20260824120000_platform_superadmin_and_company_type/migration.sql` (naming per convention, cf. `20260813120000_product_image_nullable`):

```sql
ALTER TABLE "app_user" ADD COLUMN "is_superadmin" BOOLEAN NOT NULL DEFAULT false;
CREATE TYPE "CompanyType" AS ENUM ('catalog');
ALTER TABLE "company" ADD COLUMN "type" "CompanyType" DEFAULT 'catalog';
```

Column stays NULLable — existing rows read NULL, default applies to inserts omitting `type` (exactly the salesops-companies spec). Enum prior art: `"MembershipStatus"` (`20260804140100`). Domain mirrors: `User.isSuperadmin: boolean`, `Company.type: 'catalog' | null`, exported `CompanyType`.

### D6: Console calls api-idp via `platform-api.server.ts`
Mirrors `api.server.ts` verbatim (Bearer header, exactly-one refresh-and-retry, destroy session on second 401) MINUS `X-Company-Id` (no tenant context exists), base URL `apiIdpBaseUrl()`. Superadmin verification happens server-side per request: the layout guard calls the platform list endpoint; `403` (non-superadmin) and anonymous/expired both produce the IDENTICAL `/admin/login?returnTo=…` redirect — satisfying the indistinguishability requirement without ever exposing `isSuperadmin` to the client (JWT payload stays `{sub, login}` per ADR-2; login body unchanged).

## Data Flow

    Browser (admin.<host>) ──root loader──► platform branch
      │                                        │
      ▼                                        ▼
    _platform layout loader ──fetch──► api-idp POST /auth/refresh (if needed)
      │            │                     GET/POST /platform/companies
      │            ▼                              │
      │     401/403 → login redirect        JwtAuthGuard ──► SuperadminGuard
      ▼                                     POST: create owner User ──► Saga.run(ownerId)
    /tiendas renders Spanish list/form             (orphan owner = harmless)

## File Changes

Production (~398 lines):

| File | Action | ~Lines |
|---|---|---|
| `templates/packages/infra-db/prisma/master/migrations/20260824120000_.../migration.sql` | Create | 8 |
| `templates/packages/infra-db/prisma/master/schema.prisma` | Modify | +7 |
| `templates/packages/domain/src/users/user.ts` (isSuperadmin) | Modify | +2 |
| `templates/packages/domain/src/company/company.ts` (type + CompanyType) | Modify | +4 |
| `templates/packages/api-common/src/auth/jwt.strategy.ts` (sanitize map) | Modify | +2 |
| `templates/apps/api-idp/src/app/app.module.ts` (register module) | Modify | +2 |
| `templates/apps/api-idp/src/platform/platform.module.ts` | Create | 11 |
| `templates/apps/api-idp/src/platform/superadmin.guard.ts` | Create | 26 |
| `templates/apps/api-idp/src/platform/platform.controller.ts` | Create | 60 |
| `templates/apps/api-idp/src/platform/platform.service.ts` | Create | 48 |
| `templates/apps/api-idp/src/platform/dto/create-platform-company.dto.ts` | Create | 22 |
| `templates/apps/web-catalog/app/shared/lib/tenant.server.ts` (isPlatformAdminHost) | Modify | +12 |
| `templates/apps/web-catalog/app/root.tsx` (branch + platform shell) | Modify | +18 |
| `templates/apps/web-catalog/app/routes.ts` (register `_platform` branch) | Modify | +5 |
| `templates/apps/web-catalog/app/shared/routes/_platform.tsx` | Create | 30 |
| `templates/apps/web-catalog/app/platform/routes/tiendas.tsx` | Create | 38 |
| `templates/apps/web-catalog/app/platform/routes/tiendas-nueva.tsx` | Create | 68 |
| `templates/apps/web-catalog/app/shared/lib/platform-api.server.ts` | Create | 42 |

Test files (~450 lines, outside the production budget): listed below.

## Interfaces / Contracts

HTTP contract (all JSON):

| Method & Path | Guard chain | 2xx | Errors |
|---|---|---|---|
| `GET /platform/companies` | `JwtAuthGuard`, `SuperadminGuard` | 200 `[{id,name,slug,isActive,type}]` | 401 unauthenticated, 403 `isSuperadmin=false` |
| `POST /platform/companies` | same | 201 `{company:{id,name,slug,type},ownerLogin,temporaryPassword}` | 400 empty name / bad slug regex / type≠`'catalog'`; 409 duplicate slug OR duplicate owner login; 401/403 |

DTO: `{ name: string; slug: /^[a-z0-9]+(-[a-z0-9]+)*$/; type: 'catalog'; ownerLogin: string; temporaryPassword: string(min 8) }` — value-import class (ValidationPipe needs runtime metadata, cf. FIX 4 comment in `company.controller.ts:20-24`). Self-service `create-company.dto.ts` untouched. `temporaryPassword` appears in exactly this one response, never logged, hash-only persistence (bcrypt cost 10).

## Testing Strategy

Every spec scenario → concrete file:

| Spec scenario | Test file |
|---|---|
| Gate admits superadmin w/o Membership; 403 non-superadmin; 401 never reaches gate | `superadmin.guard.spec.ts` (new) |
| List includes `schemaName=null`; list gated | `platform.controller.spec.ts` (new) |
| 400 validation (slug/name/type) before ANY write | `platform.controller.spec.ts` |
| Happy path (owner created THEN saga, correct ownerId) | `platform.service.spec.ts` (new) |
| Dup slug → 409; dup login → 409 + saga NOT called | `platform.service.spec.ts` |
| Password shown once / never logged / hash persists | `platform.service.spec.ts` |
| Identity: `req.user={id,login,isActive,isSuperadmin}`, no roles; cache-safe | `jwt.strategy.spec.ts` (modify) |
| Default-false / not-a-bitmask / login-body-has-no-flag | existing green suites: `roles.guard.spec.ts`, `auth.controller.spec.ts` (unchanged = regression proof) |
| Company.type defaults / zero behavioral effect | `create-company.saga.spec.ts` + `company.ts` unit (green-unchanged) |
| `isPlatformAdminHost` truth table | `tenant.server.test.ts` (modify) |
| Tenant×`/tiendas`→404; admin×`/`→redirect; admin×`/productos`→redirect; admin×`/tiendas` serves | `app/__tests__/platform-host.test.tsx` (new) |
| Anonymous & non-superadmin → identical login redirect; superadmin lists stores; form fields | `app/platform/routes/__tests__/tiendas.test.tsx` (new) |

Approach follows existing conventions: Nest unit tests with mocked ports (cf. `company.controller.spec.ts`), Vitest + Testing Library for routes (cf. `admin/routes/__tests__/`).

## Threat Matrix

N/A — no shell commands, subprocesses, VCS/PR automation, executable-file classification, or process-integration boundary. HTTP host/path routing IS changed and is fully specified by D4's host × path matrix with planned RED tests above; the matrix's documentation/git rows do not apply.

## Migration / Rollout

One additive master migration (D5) — safe under old code (columns unread). Rollback: revert commits on main; optionally drop columns/enum via follow-up SQL. No feature flags; console is unreachable until DNS/host points `admin.<host>` at web-catalog.

## Open Questions

- None blocking. (Noted, non-blocking: whether a superadmin may also self-service `POST /companies` — unchanged behavior either way.)
