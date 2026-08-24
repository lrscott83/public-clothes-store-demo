# Exploration — platform-superadmin

Read-only investigation. All paths relative to `templates/` unless noted.

## 1. Roles & master schema

### Where roles live today
- `packages/domain/src/users/roles.ts:5-12` — `USER_ROLES` bitmask (framework-free): `user=1, warehouse_operator=2, sales_operator=4, owner=8, admin=16, sales_agent=32`. Helpers `hasRole/addRole/removeRole/getRoles`, `effectiveRoles()` (`roles.ts:77-85`; `admin` => ALL bits, `owner` => BUSINESS bits), `can()` union semantics.
- This bitmask is COMPANY-SCOPED by design. It is stored on the *tenant* `CompanyUser.role` (one row per Postgres tenant schema), never on master `User`.
- Master `User` has NO role/flag column — confirmed. `packages/infra-db/prisma/master/schema.prisma:31-34` states it explicitly: "`User` carries NO role bitmask — authorization is a property of the (user, company) pair". Model at `schema.prisma:36-52` (`app_user`): id, login, passwordHash, fullName, email, cellPhone, isActive, timestamps, relations only.
- Domain mirror `packages/domain/src/company/company.ts:14-33` (`Company`: id/name/slug/isActive/schemaName/timestamps — no `type` field anywhere).

### Minimal superadmin representation
| Option | Description | Pros | Cons |
|---|---|---|---|
| A: Boolean column | `isSuperadmin Boolean @default(false) @map("is_superadmin")` on master `app_user` | Master-level fact needing no `(user, company)` pair — exactly what a platform admin is; zero interaction with `effectiveRoles`/`BUSINESS_ROLES_MASK`; flows through `JwtStrategy`'s fresh per-request user load (ADR-2) | A second authz mechanism alongside the bitmask (but scoped to master-only endpoints) |
| B: New bit (64) in `USER_ROLES` | Reuse existing mask machinery | One mechanism | Semantically wrong: mask lives on tenant `CompanyUser`, which requires ACTIVE Membership + provisioned schema — a platform admin must NOT need any tenant; pollutes `BUSINESS_ROLES_MASK`/label tables |

Recommendation: Option A. The guard-order invariant (`roles.guard.ts:16-27`) hard-couples `req.user.roles` to tenant resolution; a platform bit inside that chain would fight the invariant rather than extend it.

### Migration conventions
- `packages/infra-db/prisma/master/migrations/`: `YYYYMMDDHHMMSS_snake_case_name/migration.sql`. Existing: `20260804140000_baseline_existing_master_tables`, `20260804140100_add_membership_and_templates`, `20260813120000_product_image_nullable`.
- SQL produced via `prisma migrate diff --from-schema ... --to-schema prisma/master/schema.prisma --script` (per comment, `20260804140100/migration.sql:3-4`).
- One new migration can carry both changes: `ALTER TABLE "app_user" ADD COLUMN "is_superadmin" BOOLEAN NOT NULL DEFAULT false;` plus the Company.type enum/column (see section 6).

## 2. api-idp company/auth surface

### CreateCompanySaga input contract
- `CreateCompanySagaInput = { name: string; slug: string; ownerId: string }` (`create-company.saga.ts:25-30`). `ownerId` REQUIRED — becomes tenant `CompanyUser` with `owner` role (step 5) and gets an ACTIVE master `Membership` (step 4).
- Six steps, none transactional; reverse-order compensation writing `ProvisioningIncident` rows on failure (`create-company.saga.ts:40-48, 172-209`). Catalog copy AWAITED (step 6). Spec stubs repos + tenant client via the protected `copyCatalog` seam (`create-company.saga.spec.ts:73-99`).

### Controller & DTO
- `POST /companies`: `JwtAuthGuard` ONLY — deliberately no TenantContextGuard/RolesGuard because no tenant exists yet (`company.controller.ts:32-55`). Caller becomes owner: `ownerId: req.user.id` (`company.controller.ts:53`).
- `GET /companies/:slug`: JwtAuthGuard only (`company.controller.ts:66-74`) — consumed by web-catalog's `company.server.ts`.
- Error mapping (`company.controller.ts:76-88`): `InvalidCompanyError` -> 400, `DuplicateCompanySlugError` -> 409, else rethrow.
- `dto/create-company.dto.ts:1-19`: `name` non-empty, `slug` regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Comment is LOAD-BEARING: "`ownerId` is NEVER accepted here... so no caller can provision a company on someone else's behalf." A superadmin create-on-behalf endpoint must therefore be a SEPARATE endpoint/route, never a widening of this DTO.

### JWT payload / AuthenticatedUser
- `JwtAccessPayload = { sub, login }` ONLY (`api-common/src/auth/jwt.config.ts:59-63`; ADR-2 — roles resolved fresh per request, never baked into token). Nothing usable for platform gating today.
- `AuthenticatedUser = Omit<User, 'passwordHash' | 'roles'>` (`jwt.strategy.ts:17`). With Option A, add `isSuperadmin` to `sanitize()`'s explicit field map (`jwt.strategy.ts:77-88`) and it becomes available after `JwtAuthGuard` alone.

### Login & user creation precedents
- `POST /auth/login` via `LocalAuthGuard` -> `AuthService.validateUser` (`auth.service.ts:70-80`): `bcrypt.compare`, enumeration-safe identical 401 for unknown login / wrong password / inactive user.
- User creation exists in THREE places besides seed:
  1. `POST /auth/signup` — PUBLIC self-registration, creates ONLY the `User`, no membership (`auth.service.ts:98-123`; controller `auth.controller.ts:51-55`). Duplicate login -> `ConflictException` 409.
  2. `UsersService.create` (`apps/api-idp/src/users/users.service.ts:74-113`) — admin/owner-created user with explicit role bitmask INSIDE an open tenant scope; order User -> tenant CompanyUser -> master Membership, non-transactional, partial states documented as harmless ("a User with no CompanyUser/Membership cannot authenticate anywhere").
  3. `CustomerIdentityService.createWithIdentity` (`apps/api-salesops/src/customer/customer-identity.service.ts:123`) — buyer identity creation.
- Creating the owner user with a temporary password has direct precedent (pattern: bcrypt hash -> `userRepository.create` -> catch `DuplicateLoginError` -> 409). No email service exists (`auth.service.ts:212-215` documents delivery as deferred; reset tokens are logged server-side dev-only).

## 3. api-common guards

- Chain invariant: `@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)` — order documented as load-bearing (`tenant-context.guard.ts:38-44`, `jwt.strategy.ts:20-57`).
- `TenantContextGuard` (`tenant-context.guard.ts:90-149`): companyId from `X-Company-Id` header or sole ACTIVE membership; 403 if no ACTIVE membership / inactive company / null `schemaName`; 503 if schema behind; then reads tenant `CompanyUser.role` and REASSIGNS `req.user` to a NEW `SanitizedUser` object (`roles`, `companyId`, `companyUserId`) — mutation is forbidden because `JwtStrategy` caches that instance in a `TtlCache` (30s TTL).
- `RolesGuard` (`roles.guard.ts:37-72`): reads `@Roles(...)` bits via Reflector against `req.user.roles`; throws loud `403 'Tenant context not resolved'` when `req.user.roles === undefined`. Consequence: **`RolesGuard` is UNUSABLE for platform endpoints that skip `TenantContextGuard`.** Platform gating needs either a distinct guard reading `req.user.isSuperadmin` after `JwtAuthGuard` alone, or a RolesGuard extension treating the master flag as an alternative grant — the former keeps the existing invariant untouched.
- `@Roles` decorator (`roles.decorator.ts`): union semantics; omitted metadata = open to any authenticated user.

## 4. web-catalog

### Session
- `shared/lib/session.server.ts:10-14` — `SessionData = { accessToken, refreshToken, userId }`. No roles, no companyId (subdomain fixes the tenant). Cookie `domain` intentionally OMITTED so sessions do NOT leak across subdomains (`session.server.ts:41-45`) — an `admin.<host>` session is naturally isolated from tenant sessions. Good for the console.
- `withAuth` (`shared/lib/auth.guards.server.ts:32-81`) guarantees session AND resolves `companyId` from the HOST slug via `resolveCompanyId` (`company.server.ts:21-32` calls `GET /companies/:slug`). On an admin host this breaks twice: no slug resolves and there is no tenant. The console needs its own session-only guard variant (no `companyId`), or a host-aware mode on `withAuth`.

### Host parsing & current admin.<host> behavior
- `shared/lib/tenant.server.ts:21` — `RESERVED_LABELS = new Set(['www', 'api', 'admin'])`; reserved first label -> null slug. CONFIRMED identical table in `apps/api-public/src/tenant/host-slug.ts:18` (specs at `host-slug.spec.ts:30-39`).
- `root.tsx:26-29` loader runs `resolveStoreConfig(request)` for EVERY request; `store-config.server.ts:15-24` turns null slug OR unknown config into a generic 404 Response.
- **Therefore every request to `admin.<host>` currently 404s at the ROOT loader, before any route loader runs** — `/tiendas` would be unreachable without touching this gate.

### How a host-scoped console slots in
React Router routes are static/host-agnostic (`routes.ts`); the branching point is the ROOT loader.
1. Root-loader branch (recommended): add a helper next to `getRequestHostSlug`, e.g. `isPlatformAdminHost(request)` returning true when labels[0] === 'admin'; root loader returns a platform marker instead of throwing; console routes (`/tiendas`, `/tiendas/nueva`) register as top-level routes OUTSIDE `_auth.tsx` (same sibling pattern as `admin/login`/`admin/logout`, `routes.ts:8-12`), wrapped in a NEW `_platform.tsx` layout using a session-only guard. Tenant route loaders keep calling `resolveStoreConfig` unchanged.
   - Pros: minimal blast radius; tenant 404 semantics preserved for all non-admin hosts.
   - Cons: touches `root.tsx`; must guarantee NON-admin hosts cannot reach `/tiendas` (their loaders still require a StoreConfig — verify per-route) and decide behavior of admin host x storefront paths (404 vs redirect to /tiendas).
2. Separate app/entry for the console — contradicts the stated decision "inside apps/web-catalog"; heavier infra.
- Note the shell: `root.tsx:49-66` renders `Header`/`Footer` from `StoreConfig`; with a marker instead of config, App must render a distinct platform shell on admin hosts.
- Login reuse: `shared/routes/login.tsx` posts to `POST /auth/login` and stores tokens via `createSession`; it can be reused as-is by the console (role check happens server-side per request), or duplicated with console branding under a different path if the tenant `/admin/login` must stay separate.

## 5. Seed precedent for known-password users

`packages/infra-db/src/users/seed.ts`:
- `DEV_PASSWORD = 'DevPass123!'` (`seed.ts:13`), `SALT_ROUNDS = 10` (`seed.ts:14`).
- Hashing: `bcrypt` (`import bcrypt from 'bcrypt'`, `seed.ts:1`; `bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS)` at `seed.ts:80`). Same lib/cost in api-idp runtime code: `SALT_ROUNDS = 10` in `auth.service.ts:32` and `users.service.ts:23`.
- `deriveLogin(fullName, id)` (`seed.ts:31-35`): normalized name + 6-hex-char id fragment — deterministic, collision-free login derivation shared by the SQL backfill and demo-customer seed.
- Idempotent upsert keyed on `login` (`seed.ts:84-89`). Cockpit accounts include an `admin` login with `USER_ROLES.admin` — NOTE: that is the TENANT admin bit (16), not a platform role; naming for the new platform role should avoid confusion with it (e.g. `isSuperadmin` / "platform admin").

## 6. Prior art — type fields / enums in migrations

- Master migration precedent for enums: `CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE','REVOKED','SUSPENDED')` used as a column default (`20260804140100/migration.sql:9,16`).
- Tenant DDL has richer enum prior art including a literal `"type"` column: `"type" "StockMovementType" NOT NULL` (`prisma/tenant-schema.sql:13-28,109`).
- No `type` field exists on `Company` anywhere today (master schema, domain model, saga input). Proposed `Company.type` nullable default `'catalog'` maps cleanly onto the established Prisma enum pattern: `enum CompanyType { catalog }` + `type CompanyType? @default("catalog")`; SQL would be `ALTER TABLE "company" ADD COLUMN "type" "CompanyType" DEFAULT 'catalog';`. Decide explicitly whether existing rows should read `'catalog'` (add NOT NULL with default) or stay NULL (matches "nullable, default catalog" literally).

## Open questions

1. Temporary password delivery for the created owner: no EmailService exists. Show once in the console UI after creation, or follow the dev-only server-log precedent of password reset?
2. Should self-service `POST /companies` remain available to a superadmin, and can a superadmin also own tenant companies normally?
3. Does `Company.type` have behavioral effect now, or is it pure console metadata while only `'catalog'` exists?
4. api-public also reserves the `admin` label (404s). Confirm no console API traffic is expected through api-public.
5. Guard placement for platform endpoints: new guard in api-common (shared with api-salesops — implies cross-app reuse intent) vs app-local in api-idp.
6. List-all-companies endpoint shape: reuse `ICompanyRepository.list()` (exists — see mock in `create-company.saga.spec.ts:31`); pagination needs?

## Risks

- Widening `create-company.dto.ts` to accept `ownerId` would silently break the documented security property (no on-behalf provisioning). Must be a separate gated endpoint/route.
- `RolesGuard` cannot be reused without `TenantContextGuard` (loud 403 by design); a parallel platform gate risks divergence — keep its logic tiny (single boolean check) and spec-covered like `roles.guard.spec.ts` does for its invariant.
- Root-loader change in web-catalog touches EVERY request path; a regression makes tenant hosts 404 or leaks console pages onto tenant hosts. Needs explicit tests: tenant host x `/tiendas` (must 404), admin host x `/tiendas` (must serve), admin host x storefront path (decided behavior).
- If owner-user creation moves INSIDE the saga, compensation must handle a just-created master User (delete) BEFORE company rollback; alternatively create the user in the endpoint/controller layer before invoking the saga — an orphan user without membership cannot authenticate anywhere (documented harmless state), which argues for keeping the saga untouched and composing at the endpoint.
- Session cookie isolation means console login on `admin.<host>` does not share cookies with tenant subdomains — intended, but UX copy/tests must not assume cross-host session persistence.
- `JwtStrategy` TtlCache (30s): revoking superadmin rights takes up to TTL to take effect; same as existing deactivation semantics.

## Ready for Proposal
Yes. Recommended direction: boolean `is_superadmin` on master User + nullable `Company.type` enum in ONE master migration; separate superadmin-gated endpoints in api-idp (list companies; create-company-on-behalf composing user creation + existing saga unchanged); web-catalog root-loader host branch serving `/tiendas` routes under a new `_platform.tsx` layout with a session-only guard.
