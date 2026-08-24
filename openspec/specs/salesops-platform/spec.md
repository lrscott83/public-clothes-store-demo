# salesops-platform Specification

## Purpose

Platform-level administration surface, outside every tenant: the superadmin
identity gate on master `User`, list/create-on-behalf company endpoints in
api-idp, show-once temporary-password semantics for created owners, and the
web console served on the reserved `admin` host label.

## Requirements

### Requirement: Superadmin Identity Gate

Master `User` MUST carry `isSuperadmin` (`is_superadmin BOOLEAN NOT NULL
DEFAULT false`) — a master-level platform fact independent of any
`Membership` or tenant `CompanyUser`, and NOT a bit in the company-scoped
`USER_ROLES` mask. Platform endpoints MUST be gated by a dedicated guard
that reads `req.user.isSuperadmin` after `JwtAuthGuard` ALONE. `RolesGuard`
MUST NOT be used: it requires `TenantContextGuard` and fails loud when no
tenant context exists — unusable by design here. An authenticated caller
with `isSuperadmin=false` MUST receive `403`; an unauthenticated request
MUST receive `401`.

#### Scenario: Superadmin passes the gate with no tenant context

- GIVEN an authenticated user with `isSuperadmin=true` and NO ACTIVE
  `Membership` anywhere
- WHEN they call any platform endpoint
- THEN `JwtAuthGuard` alone resolves them and the dedicated gate admits the
  request — no tenant resolution ever runs

#### Scenario: Non-superadmin is rejected with 403

- GIVEN an authenticated user with `isSuperadmin=false`
- WHEN they call any platform endpoint
- THEN the response is `403`

#### Scenario: Unauthenticated request is rejected with 401

- GIVEN a request with no valid access token
- WHEN it hits a platform endpoint
- THEN the response is `401` — the identity gate never runs

### Requirement: List Companies Endpoint

A superadmin-only endpoint (e.g. `GET /platform/companies`) MUST return all
companies — including inactive and unprovisioned ones (`schemaName=null`)
— with `id`, `name`, `slug`, `isActive`, and `type`. It MUST NOT require
tenant context.

#### Scenario: Listing includes unprovisioned companies

- GIVEN one provisioned company and one with `schemaName=null`
- WHEN a superadmin calls the list endpoint
- THEN both are returned

#### Scenario: Listing is gated

- GIVEN a non-superadmin authenticated user
- WHEN they call the list endpoint
- THEN the response is `403`

### Requirement: Create Company On Behalf Endpoint

A superadmin-only endpoint (e.g. `POST /platform/companies`) MUST accept
`name`, `slug`, `type` (only `'catalog'` valid today), owner `login`, and a
temporary password. The ENDPOINT layer MUST first create the owner master
`User` (bcrypt-hashed password), then invoke the UNCHANGED
`CreateCompanySaga` with `ownerId` set to the new owner. The self-service
`create-company.dto.ts` MUST NOT be widened to accept `ownerId`. Errors:
duplicate company slug → `409`; duplicate owner login → `409`; invalid
slug format, empty name, or invalid type → `400`.

If the saga fails after the owner was created, the orphan owner User
(without Membership) is a documented harmless state — it cannot
authenticate into any tenant.

#### Scenario: Happy path provisions store and owner

- GIVEN a superadmin submits valid name/slug/type/owner credentials
- WHEN the endpoint processes the request
- THEN the owner `User` exists, the saga ran with that `ownerId`, and the
  response reports success

#### Scenario: Duplicate slug returns 409

- GIVEN a `Company` with `slug="acme"` already exists
- WHEN a create-on-behalf request uses `slug="acme"`
- THEN the response is `409`

#### Scenario: Invalid input returns 400

- GIVEN a payload whose slug fails the existing slug regex (or empty name,
  or type other than `'catalog'`)
- WHEN the endpoint validates it
- THEN the response is `400` before any User or Company row is written

#### Scenario: Duplicate owner login returns 409 without touching companies

- GIVEN an existing `User` with the requested owner login
- WHEN the create-on-behalf request runs
- THEN the response is `409` and no `Company` is created

### Requirement: Temporary Password Show-Once Semantics

The temporary password MUST be returned as plaintext exactly once, in the
create-on-behalf response consumed by the console's success state. It MUST
NOT be logged server-side, MUST NOT appear in any later API response, and
MUST NOT be retrievable — only its bcrypt hash persists.

#### Scenario: Password appears once and never again

- GIVEN a successful create-on-behalf call
- WHEN the console renders the success state and any later request inspects
  the created user
- THEN the plaintext appeared only in that single success render; afterwards
  only the bcrypt hash exists and no endpoint can return it

### Requirement: Admin Host Serves Only Platform Routes

The root loader MUST branch on the reserved host label `admin`: on the admin
host, tenant/store resolution is SKIPPED and ONLY the platform routes
(`_platform` layout, `/tiendas`, `/tiendas/nueva`) are served; `/` redirects
to `/tiendas`; any other admin-host path redirects to `/tiendas`. On ANY
non-admin host, `/tiendas` MUST produce the generic tenant `404` — identical
to any unknown storefront path, revealing nothing.

#### Scenario: Tenant host cannot reach the console

- GIVEN a request to `tienda.example.com/tiendas`
- WHEN the root loader runs
- THEN normal tenant resolution proceeds and the response is the generic
  `404`

#### Scenario: Admin host root redirects to /tiendas

- GIVEN a request to `admin.example.com/`
- WHEN the platform layout handles it
- THEN the browser lands on `/tiendas`

#### Scenario: Admin host storefront paths do not leak storefronts

- GIVEN a request to `admin.example.com/productos`
- WHEN the platform routing evaluates it
- THEN the user is redirected to `/tiendas` — no tenant content is rendered

### Requirement: Console Session Guard and Non-Superadmin Handling

The console MUST use a session-only guard variant: a valid session with an
access token is required, but `companyId` MUST NOT be resolved from the
host (no `withAuth`). A session whose user is not superadmin hitting an
admin-host platform route MUST be redirected to the login flow —
indistinguishable from an expired-session redirect, leaking nothing about
the platform surface's data. Sessions on the admin host remain isolated
from tenant-host sessions (cookie domain omitted).

#### Scenario: Anonymous visitor to /tiendas is redirected to login

- GIVEN no session cookie on `admin.<host>`
- WHEN `/tiendas` is requested
- THEN the user is redirected to the login route

#### Scenario: Authenticated non-superadmin gets the same redirect

- GIVEN a valid session for a non-superadmin user
- WHEN `/tiendas` or `/tiendas/nueva` is requested
- THEN the response is the same login redirect as the anonymous case —
  same status and destination

#### Scenario: Console lists stores for a superadmin session

- GIVEN a valid session for a superadmin
- WHEN they open `/tiendas`
- THEN all companies are listed via the platform list endpoint, and
  `/tiendas/nueva` offers name, slug, type, and owner credentials
