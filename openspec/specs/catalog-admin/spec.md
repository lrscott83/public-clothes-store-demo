# Catalog Admin Specification

## Purpose

Owner/admin back office at `/admin` on the store's own subdomain:
`api-idp` login, `httpOnly` cookie session, full CRUD for products and
categories, soft deletes only, no store switcher — the store under edit is
fixed by the subdomain and independently re-verified against the caller's
membership on every mutation.

## Requirements

### Requirement: Admin Session Uses an httpOnly Server-Side Cookie
Login MUST authenticate against `api-idp`. The access token MUST be stored
in an `httpOnly` server-side cookie and MUST NEVER be exposed to
browser-side JavaScript, a response body, or a non-`httpOnly` cookie.

#### Scenario: Successful login never exposes the token to the client
- GIVEN valid owner/admin credentials
- WHEN login succeeds
- THEN the access token appears only in an `httpOnly` `Set-Cookie` header —
  never in the response body or a script-readable cookie

### Requirement: Admin Routes Require owner or admin Role
`/admin` and its sub-routes MUST reject a caller whose Membership role in
the resolved company is neither `owner` nor `admin`.

#### Scenario: Non-owner/admin role is denied
- GIVEN a user with an ACTIVE Membership whose role is neither owner nor admin
- WHEN they request an `/admin` route
- THEN access is denied

#### Scenario: owner or admin role is granted access
- GIVEN a user with an ACTIVE owner or admin Membership for the resolved company
- WHEN they request an `/admin` route
- THEN access is granted

### Requirement: Store Under Edit Is Fixed by Subdomain, Re-Verified Per Mutation
The company being edited MUST be determined solely by the request's
subdomain — there MUST be no UI or API mechanism to select a different
company. Every mutation MUST independently re-verify the caller's ACTIVE
owner/admin Membership in that exact company; a caller with membership only
in company A MUST NOT be able to alter company B's data by any request they
can construct.

#### Scenario: Admin edits their own company's product
- GIVEN an admin with membership in company A, on `a.tld`
- WHEN they edit a product belonging to company A
- THEN the edit succeeds

#### Scenario: Cross-company mutation attempt is rejected
- GIVEN an admin with membership ONLY in company A, on `a.tld`
- WHEN they submit a request targeting a product/category id that belongs
  to company B
- THEN the request is rejected — never silently applied to A or B

#### Scenario: No store-switcher control exists
- GIVEN a user with memberships in multiple companies
- WHEN the admin UI renders
- THEN no company-selector control is present

### Requirement: Full CRUD for Products and Categories, owner/admin Only
Owner/admin MUST be able to create, read, and update products and
categories within their resolved company.

#### Scenario: Admin creates a product
- GIVEN valid product fields and an existing category
- WHEN an admin submits creation
- THEN the product persists in that company's schema

#### Scenario: Admin updates a category
- GIVEN an existing category
- WHEN an admin edits its name/order
- THEN the change persists

### Requirement: Deletes Are Always Soft
Deleting a product or category from `/admin` MUST set `active=false` — it
MUST NEVER issue a hard delete.

#### Scenario: Deleting a product sets active=false, row persists
- GIVEN an existing active product
- WHEN an admin deletes it
- THEN `active` becomes `false` and the row still exists in the database

## Non-Goals

- No image-upload validation detail here — owned by `salesops-products`'s
  delta (the endpoint `catalog-admin`'s UI calls).
- No cart, checkout, or multi-store bulk operations.
