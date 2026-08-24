# Proposal: Platform Superadmin Console

## Intent

There is no way to administer tenants at platform level: master `User` carries no
platform flag, no endpoint lists all companies or provisions one on behalf of an
owner, and `admin.<host>` 404s at the root loader before any route runs. We add a
platform-level `superadmin` (master `User`) and an admin-host console to list and
create tenant companies.

## Scope

### In Scope

- Master migration adding `app_user.is_superadmin BOOLEAN NOT NULL DEFAULT false`
  and nullable `company.type "CompanyType" DEFAULT 'catalog'` (enum-style, one
  migration), plus domain model fields.
- api-idp: `SuperadminGuard` (reads `req.user.isSuperadmin` after `JwtAuthGuard`
  alone — `RolesGuard` hard-fails tenant-less by design); `GET` list-companies;
  `POST /platform/companies` create-on-behalf composing owner-user creation +
  temporary password in the ENDPOINT layer, then invoking the untouched saga.
- Temporary password shown ONCE in the UI success state; only bcrypt hash persists.
- web-catalog: root-loader host branch on reserved label `admin` (no tenant
  resolution, no `/superadmin` prefix); session-only guard variant (withAuth breaks
  without a company slug); routes `/tiendas`, `/tiendas/nueva`; root of admin host
  redirects to `/tiendas`; Spanish UI copy matching existing admin convention.
- Create form fields: name, slug, type (`'catalog'` only value today), owner login
  + temporary password.

### Out of Scope

- Editing/deleting tenants; multi-type behavior (`type` is data only); invite flows;
  email delivery; changes to public/tenant surfaces beyond the root-loader branch;
  any widening of self-service `POST /companies`.

## Capabilities

### New Capabilities
- `salesops-platform`: platform-superadmin identity flag, SuperadminGuard,
  list/create-on-behalf endpoints, owner-user composition, show-once password rule,
  admin-host console routing/session guard.

### Modified Capabilities
- `salesops-identity`: master `User` gains `isSuperadmin`; sanitized JWT user exposes it.
- `salesops-companies`: `Company` entity gains nullable `type` field.

## Approach

Exploration Option A: boolean column on master `User` (bitmask is company-scoped by
design — wrong home for a platform fact). Separate gated route, never widening
`create-company.dto.ts` (load-bearing "no on-behalf" comment). Saga untouched —
owner created in endpoint layer first; orphan-user-without-membership is a
documented harmless state if saga compensation runs. Console as top-level routes
under a `_platform.tsx` layout outside `_auth.tsx`, mirroring `admin/login` siblings.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `packages/infra-db/prisma/master/` | Modified | One migration: `is_superadmin` + `CompanyType` |
| `packages/domain/src/users/`, `packages/domain/src/company/` | Modified | `isSuperadmin`, `type` model fields |
| `apps/api-idp/src/platform/` | New | Guard, controller, service, DTOs |
| `apps/api-common/src/auth/jwt.strategy.ts` | Modified | Sanitize `isSuperadmin` |
| `apps/web-catalog/app/root.tsx`, `shared/lib/tenant.server.ts` | Modified | Admin-host branch |
| `apps/web-catalog/app/routes/_platform.*` | New | Console layout, `/tiendas`, `/tiendas/nueva` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Root-loader regression affects all hosts | Med | Tests: tenant host × `/tiendas` → 404; admin host × `/tiendas` → serves |
| Parallel guard diverges from RolesGuard | Low | Single boolean check; spec-covered like `roles.guard.spec.ts` |
| Password leaks via logs/responses | Low | Success-state-only render; never logged; hash-only persistence |

## Rollback Plan

Revert commits on main; migration is additive-only (new columns unused by old code)
— safe to leave applied, or drop columns via follow-up SQL.

## Dependencies

- None external. Reuses existing bcrypt, seed password UX precedent, `RESERVED_LABELS`.

## Success Criteria

- [ ] Superadmin lists and creates companies from `admin.<host>/tiendas`
- [ ] Non-admin hosts cannot reach `/tiendas`; admin host storefront paths handled explicitly
- [ ] Owner can log in with displayed temp password; password never retrievable later
- [ ] Non-superadmin gets 403 on platform endpoints
