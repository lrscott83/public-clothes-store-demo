# Delta for salesops-tenancy

## ADDED Requirements

### Requirement: Anonymous Subdomain Tenant Resolution
The system MUST provide an unauthenticated tenant-resolution path for public
read endpoints, served by a NEW guard — separate from "Tenant Resolution
Guard Chain" above, which stays unchanged. It MUST derive the tenant from
the first label of the request's subdomain, resolve it via
`ICompanyRepository.findBySlug` (see `salesops-companies`), and REQUIRE
NEITHER a JWT NOR a `Membership` row. On success it MUST open the tenant
context the same way the authenticated path does (`tenantContext.run(...)`).

#### Scenario: Known, active, provisioned slug resolves with no auth
- GIVEN a request whose subdomain's first label matches a Company.slug with
  `isActive=true` and a non-null `schemaName`
- WHEN the public tenant guard runs
- THEN the tenant context opens for that company's schema — no
  `Authorization` header and no `Membership` row are required or checked

#### Scenario: Public resolution never invokes the authenticated guard chain
- GIVEN a request to a public (`api-public`) endpoint
- WHEN it is processed
- THEN `JwtAuthGuard`, the Membership-resolution branch of
  `TenantContextGuard`, and `RolesGuard` are never invoked

### Requirement: Unknown Slug and Inactive Company Return an Indistinguishable 404
Public tenant resolution MUST return `404` for BOTH an unknown slug (no
matching `Company`) and an inactive/unprovisioned company (`isActive=false`
OR `schemaName=null`). The two responses MUST be indistinguishable by an
external caller — same status, same generic body, no detail that discloses
which case occurred.

#### Scenario: Unknown slug returns 404
- GIVEN a subdomain whose first label matches no `Company.slug`
- WHEN a public endpoint is requested
- THEN the response is `404`

#### Scenario: Inactive or unprovisioned company returns the same 404
- GIVEN a subdomain resolving to a `Company` with `isActive=false` OR
  `schemaName=null`
- WHEN a public endpoint is requested
- THEN the response is `404`, identical in status and body shape to the
  unknown-slug case

#### Scenario: The two 404 causes cannot be told apart from the response
- GIVEN one response from the unknown-slug scenario and one from the
  inactive-company scenario
- WHEN they are compared
- THEN no field, header, or body content differs in a way that reveals
  which case produced it
