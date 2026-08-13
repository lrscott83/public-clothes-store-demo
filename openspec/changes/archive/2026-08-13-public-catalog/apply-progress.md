# Apply Progress: public-catalog

**Batch**: 12 of 12 — Phase 0 through Phase 7 ALL COMPLETE. Ready for `sdd-archive`.
**Mode**: Strict TDD
**Delivery**: commits only, branch `public-catalog`, no PRs

## Documentation-sync note (added during `sdd-verify`, 2026-08-13)

This file stalled at commit `3070a34` (task 6.5) for three batches even
though tasks 6.6, 6.7, and Phase 7 (final verification) all landed and are
real, complete work — `tasks.md` (53/53 checked) and `git log` both confirm
it, and Phase 7's evidence was fully captured in engram `sdd/public-catalog/
apply-progress` (#2147) at the time, just never copied into this committed
file. The first formal `sdd-verify` pass (2026-08-13) flagged this as two
WARNINGs (artifact-sync gap, TDD-table gap) — 0 CRITICAL, nothing about the
actual implementation was found wrong. The sections below for 6.6, 6.7, and
Phase 7 are added now, sourced from `git show` on the actual commits and
from engram #2147's Phase 7 record, to bring this file back in sync before
`sdd-archive`.

## Reconciliation note (found at the start of this batch, not introduced by it)

Two commits exist on `public-catalog` after Batch 4's apply-progress save
that this file never recorded: `48f95f4` (a prior reconciliation of Phase
2's commit count, docs-only) and `98f1ef4` ("inspect image magic numbers
instead of trusting Content-Type" — a real security fix to Phase 3's
`apps/api-salesops` upload endpoint: turns `FileTypeValidator`'s magic-number
sniffing back ON, widens the MIME allowlist to include `image/avif`, and adds
2 tests). Both are real, already-committed work — not something this batch
redid. `git log` was checked before starting Phase 4 specifically to catch
this (see the orchestrator's own "check spec/commit history" discipline).
The commit list and test counts below are corrected to include them; no
code from either commit was touched or re-authored by this batch.

## Completed Tasks (Phase 0 — Risk Spikes)

- [x] 0.1a Scaffold bare `apps/api-public` (Nest, `GET /health` only) and bare `apps/web-catalog` (RR7, host-echo loader)
- [x] 0.1b Proof: `Host: default.localhost:3000` reaches both dev servers with the header intact
- [x] 0.2 Proof: `PrismaCompanyRepository.findById` succeeds with no `tenantContext.run(...)` wrapper — `PrismaMasterService` is schema-independent (D2)
- [x] 0.3 Proof: `sharp` installs and runs in this pnpm/turbo workspace
- [x] 0.4a RED: `money.test.ts` proves native `Intl.NumberFormat({currency:'MN'})` throws, specifies `formatMoney`
- [x] 0.4b GREEN: `formatMoney` implemented with explicit `MN` branch, USD/EUR fall through to `Intl.NumberFormat`

**All 4 spikes PASS.** No design rework triggered.

## Completed Tasks (Phase 1 — Cross-Package Foundations)

- [x] 1.1 RED: `prisma-company.repository.spec.ts` — `findBySlug` resolves an existing company incl. `isActive`/`schemaName`; returns `null` for unknown slug
- [x] 1.2a GREEN: `findBySlug(slug): Promise<Company | null>` added to `ICompanyRepository` (additive)
- [x] 1.2b GREEN: implemented in `PrismaCompanyRepository` against the existing unique `slug` column, no migration
- [x] 1.3 RED: `product-image-store.port.test.ts` — `assertProductImageRef` accepts fresh-upload and seeded ref shapes, rejects `..`, leading `/`, `\`
- [x] 1.4 GREEN: `IProductImageStore` port created — `PutProductImageInput`, `ProductImageContent`, `PRODUCT_IMAGE_STORE` symbol, `assertProductImageRef`, `InvalidProductImageRefError` (D1), all in one file, no filesystem/adapter code
- [x] 1.5 RED: `prisma-product.repository.spec.ts` — `search` does case-insensitive `OR` over name/description; behaviour unchanged when `search` is absent
- [x] 1.6a GREEN: `search?: string` added to `ProductListFilter` (additive)
- [x] 1.6b GREEN: implemented in `PrismaProductRepository.list` — `OR` of two `contains` + `mode: 'insensitive'` clauses, only applied when `search` is set
- [x] 1.7 `frozenStorefrontBoundaryRule` and `frozenLegacyAppRule` added to `backend-boundaries.config.js` (additive exports, not yet wired anywhere)
- [x] 1.8 **Own commit.** `frozenLegacyAppRule` wired into `apps/static-store/eslint.config.mjs` — the ONLY authorised edit to a frozen app in this change

**All 8 Phase 1 tasks complete.**

## Completed Tasks (Phase 2 — `packages/infra-storage`)

- [x] 2.1 RED: `fs-product-image.store.spec.ts` — put→open round trip on a tmpdir; `open()` returns `null` for a missing ref; ref rejection reuses 1.3's `assertProductImageRef`
- [x] 2.2 GREEN: `FsProductImageStore implements IProductImageStore` — resolves under `<STORAGE_PATH>/<companyId>/`, streams on read (never buffers), extension derived from an explicit `declaredMimeType` allowlist (never a filename)
- [x] 2.3 RED: `normalize-image.spec.ts` — EXIF rotate honoured, output always webp, oversize (`>1600px`) downscaled `withoutEnlargement`, non-image input → `UnsupportedImageError`, never an uncaught throw
- [x] 2.4 GREEN: `normalize-image.ts` — the only file in the package importing `sharp`: `.rotate()` → `.resize({width:1600, withoutEnlargement:true})` → `.webp({quality:82})`
- [x] 2.5 Spike 0.5 proof, unblocked by 2.1/2.2: `restart-proof.spec.ts` spawns TWO separate `node` OS processes via `execFileSync` — one writes through `FsProductImageStore.put()` under a FIXED `STORAGE_PATH` (`.storage-restart-proof/`, never a tmpdir) and exits; only after it has fully died does a second, unrelated process read the same ref via `open()` and get the exact bytes back. `packages/infra-storage/README.md` documents the `STORAGE_PATH`/mounted-volume requirement.
- [x] 2.6 Explicit scope note (not silently dropped): README records that the full container-volume-mount proof (a `docker-compose` service definition) is out of scope — no compose file wires `api-public`/`api-salesops`/`web-catalog` in this repo today, and design.md §4's file map does not name one. 2.5's process-restart proof covers the mechanism the feature depends on; container deployment config is a documented follow-up.

**All 6 Phase 2 tasks complete.** Next unblocked: Phase 3 (`apps/api-salesops`
image upload endpoint — `POST /products/:id/image`, `InfraStorageModule` wired
into `product.module.ts`).

## Completed Tasks (Phase 3 — `apps/api-salesops` authenticated image upload)

- [x] 3.1 RED: `apps/api-salesops/src/product/product.controller.spec.ts` — 7 new
      test cases added to a new `describe('POST /products/:id/image')` suite
      covering all 4 salesops-products ADDED requirements: valid upload
      succeeds; non-owner/admin 403; oversized 413; disallowed MIME 400; 404
      when the target product doesn't exist; and 2 dedicated security cases
      (hostile filename ignored, non-image content rejected by `sharp`).
- [x] 3.2 GREEN: `POST /products/:id/image` in `product.controller.ts` —
      `FileInterceptor('image')` + two `ParseFilePipe`s (`MaxFileSizeValidator`
      10MB → 413, `FileTypeValidator` allowlist → 400), `@Roles(owner, admin)`,
      same guard chain, same `runInTenant`; calls `normalizeImage()` → `sharp`
      decode/re-encode (the real gate, D10) → `productImageStore.put()` →
      `productService.update(id, {image: ref})`.
- [x] 3.3 `product.module.ts` — imports `InfraStorageModule`; `PRODUCT_IMAGE_STORE`
      injected into `ProductController`'s constructor via `@Inject`.
- [x] 3.4 Regression: full pre-existing `apps/api-salesops` jest suite (25
      suites) AND `test:e2e` suite (10 suites) both re-run with ZERO edits to
      any pre-existing assertion — confirmed byte-identical `list` behaviour
      (no test sends `search`), confirmed the `search` filter's absence never
      changes existing responses.

**All 4 Phase 3 tasks complete.** 1 commit. Also fixed a Phase-2-origin
latent DI bug this phase's wiring exposed — see "Issues Found" below.

## Completed Tasks (Phase 4 — `apps/api-public`, NEW app)

- [x] 4.1 RED / 4.2 GREEN: `host-slug.ts` — pure, Nest-free parser (D2):
      strips the port, prefers `X-Forwarded-Host` over `Host`, rejects a
      single-label host, a reserved first label (`www`/`api`/`admin`), and a
      first label failing the slug grammar. 1 commit.
- [x] 4.3 RED / 4.4 GREEN: `public-tenant.guard.ts` + `run-in-tenant.ts` (5-line
      copy of `api-common`'s helper, D3) — resolves the tenant via
      `ICompanyRepository.findBySlug`, requires no JWT/Membership, never opens
      `tenantContext.run(...)` itself (D2). Unknown slug / inactive company /
      `schemaName: null` all produce the exact same 404 (status, body, AND
      headers minus `Date`) — proven with a real Nest+supertest app, not just
      exception-object comparison. 1 commit.
- [x] 4.5 RED / 4.6 GREEN: `public-product.service.ts` — filters `active:true`
      always + category (resolved from slug) + search via
      `IProductRepository.list`, computes `finalPrice` per row from
      `packages/domain`'s pure `pricing.ts`, sorts the FULL filtered set in
      memory (all 4 `orden` values), then slices. An unknown category slug
      short-circuits to an empty page WITHOUT querying the product
      repository. `WARN` log tripwire at >2000 materialized rows. 1 commit.
- [x] 4.7 RED / 4.8 GREEN: `dto/*.ts` (`PublicProductDto`/`PublicMoneyDto`/
      `PublicProductListResponseDto`), `image-url.ts` (content-keyed URL
      assembly, D6), `to-public-product-dto.ts` mapper,
      `parse-public-product-query.ts`, `public-product.controller.ts`
      (`GET /public/products`, `/public/products/:id`),
      `public-category.controller.ts` (`GET /public/categories`),
      `store.controller.ts` (`GET /public/store`), `public-tenant.module.ts`
      (`@Global()`, mirrors `api-common`'s `AuthModule` DI-scope precedent).
      DTO contract test asserts the response key set equals the §3 allow-list
      EXACTLY (key-set equality, not `not.toHaveProperty`) and every field's
      value type — `percentDiscountPrice`/`discountPrice`/both `amount`s are
      decimal strings, never JSON numbers. 1 commit.
- [x] 4.9 RED / 4.10 GREEN: `product-image.controller.ts` — the full D6
      matrix: missing/inactive product → 404; stale `imageKey` → 404; ref
      failing `assertProductImageRef` → 404 + `PRODUCT_IMAGE_REF_INVALID` log;
      `store.open()` returning `null` → 404 + `PRODUCT_IMAGE_MISSING` log
      (never 500, never a placeholder); matching `If-None-Match` → empty 304
      with the same `Cache-Control`; otherwise 200 with
      `Content-Type`/`Content-Length`/`ETag`/
      `Cache-Control: public, max-age=31536000, immutable`, no `Vary`, no
      `Set-Cookie`, streamed via `StreamableFile(Readable.from(...))`, never
      buffered. `companyId` passed explicitly to `store.open()` (D1). 1 commit.
- [x] 4.11: `test/tenant-isolation.e2e-spec.ts` + `jest-e2e.json` — two REAL
      companies/tenant schemas, ONE booted `AppModule`/HTTP server; isolation
      proven from the `Host` header alone (store/list/detail all correct per
      Host; neither store can read the other's product by its exact real id;
      unknown-slug and inactive-company 404 identically; a real
      `orden=precio-asc` query against the real repository/service pipeline,
      no mocks). 1 commit.

**All 6 Phase 4 code/test work units complete** (7th is this docs commit,
matching Phase 0/1/2's precedent). `apps/static-store` lint re-verified
byte-identical to task 1.8's recorded baseline (same 5 warnings, same
files/lines) — Phase 4 touched nothing under `apps/static-store`,
`packages/storefront`, or `packages/api-common`.

## Completed Tasks (Phase 5 — `apps/web-catalog` public storefront)

**Reconciliation**: 5.1-5.2 (`b5c51ed`) and 5.3-5.4 (`2c6fc47`) were already
committed on the branch when this batch started but were never recorded
here — same pattern as the Phase 3 reconciliation above. Recorded now
alongside 5.5, which this batch completed.

- [x] 5.1/5.2 `b5c51ed` — `StoreConfig` rewritten per D9 (`slug, brand,
      locale, theme.colors, logo, hero, nav, productsPage, footer`), resolved
      from the `Host` header via `tenant.server.ts` (mirrors 4.2/4.4's
      host-slug parsing); `public-api.server.ts` — thin fetch client to
      `api-public`, forwards `url.searchParams` verbatim, sends the inbound
      `Host` as `X-Forwarded-Host`. `theme-css-vars.ts` maps `theme.colors`
      to CSS custom properties. 1 commit.
- [x] 5.3/5.4 `2c6fc47` — `/productos` route: `product-query.ts` parses
      `categoria`/`q`/`orden`/`pagina`/`porPagina` from the URL verbatim and
      round-trips them into the loader's fetch call; `ProductCard`/
      `ProductGrid` render the badge stack (`Nuevo` + `-X%` + `-$X.XX`, all
      three together when applicable) via `formatMoney` (0.4), never the
      frozen `packages/storefront` formatter; empty-result state handled.
      Wired into `app/routes.ts`. 1 commit.
- [x] 5.5 (this batch) `/productos/:id` product-detail route —
      `product-detail.tsx` calls `GET /public/products/:id` via `2c6fc47`'s
      `fetchPublicProduct` (already returns `null` on 404, never throws);
      unknown/inactive id renders a "Producto no encontrado." message
      instead of crashing (mirrors `static-store/product-detail.tsx`'s
      client-degrade design, D9's per-page reference — read-only, never
      imported). Registered as `productos/:id` in `app/routes.ts`. 1 commit.

**All 3 Phase 5 code/test work units complete** (4th is this docs commit,
matching tasks.md's "4 commits total for Phase 5"). `web-catalog` full
suite: 79/79 passing (14 files). `tsc --noEmit` clean. Lint: 3 warnings
(`_args` unused in each route's `meta` — same shape as `products.tsx`'s and
`home.tsx`'s pre-existing warnings), 0 errors, within the `--max-warnings 5`
budget from task 6.4's done-criterion.

## Completed Tasks (Phase 6 — `apps/web-catalog` `/admin`, COMPLETE)

- [x] 6.1/6.2 `apps/web-catalog/app/shared/lib/session.{test,server}.ts` —
      admin session per D8: `createCookieSessionStorage` cookie
      `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure` only in
      production, 7-day `maxAge`, `domain` intentionally omitted
      (load-bearing — sharing one session across tenant subdomains would
      let an owner logged into store A arrive at store B's `/admin`
      already authenticated). `SessionData = {accessToken, refreshToken,
      userId}`, no `activeCompanyId` — the subdomain already fixes the
      store. Cookie storage is built fresh per call (not cached at module
      scope) so a missing `SESSION_SECRET` throws the first time a
      request needs a session, rather than the import silently succeeding.
      `isTokenExpired` exported (unlike poolops's module-private version)
      for direct unit coverage of the 5s expiry buffer.
      `refreshSession`'s `Map`-keyed-by-old-refresh-token de-dupe cache
      (30s eviction) ported in intent from poolops, calls `api-idp`'s
      `POST /auth/refresh` — proven with two parallel callers sharing one
      expired refresh token producing exactly one IDP fetch. No backend
      `logout` endpoint exists (unlike poolops), so `destroySession` only
      clears the cookie, no API call. `API_IDP_URL` added to
      `turbo.json`'s `globalEnv` (`SESSION_SECRET` was already declared).
      11 tests. 1 commit.

**Phase 6 done-criterion for this work unit**: "6.1 is green." Met — 6.3
(`api.server.ts`), 6.4 (`auth.guards.server.ts` + routes + eslint rule),
6.5 (product CRUD), 6.6 (category CRUD), 6.7 (image upload) remain.

- [x] 6.3 `apps/web-catalog/app/shared/lib/api.server.ts` —
      `makeAuthenticatedRequest(request, path, init)`: attaches the
      session's access token as `Authorization: Bearer` on every call to
      `api-salesops` (D7 — this app carries no authoritative copy of
      authorization, `api-salesops` resolves it server-side). A 401
      triggers exactly one `refreshSession` call (6.2's `Map` de-dupe
      already covers concurrent callers) and one retry with the new
      token; a second 401, or the refresh call itself failing, means the
      refresh token is dead — the session is destroyed and a 401 is
      thrown. Deliberately does NOT redirect to login itself: turning "no
      session" into a redirect is `withAuth`'s job (task 6.4), keeping
      the two concerns separate. 6 tests. 1 commit.

  **Bug caught by the test suite itself, not by review**: the first draft
  of the "second 401 destroys the session" test reused the same
  `refresh-1` token as an earlier test in the file. `refreshSession`'s
  de-dupe `Map` (6.2) is module-scoped and persists across `it` blocks
  within one file — the second test's `refreshSession` call silently hit
  the FIRST test's cached, already-resolved promise instead of calling
  `fetch` again, desyncing the mock queue and swallowing the expected
  throw. Fixed by giving every test in `api.server.test.ts` its own
  refresh token. Documented in a comment on the test file's helper so the
  next person adding a case doesn't reintroduce it.

  **Correction to an earlier, wrong claim in this file**: this batch
  originally recorded 6.3's "manual/integration check against api-idp
  login round-trip" done-criterion as impossible to run, based on
  `localhost:5432` refusing a connection. That check only tried
  `localhost` — Postgres is reachable from this environment via the
  Docker bridge gateway (`172.17.0.1:5432`, exactly as
  `apps/api-idp/env.example`'s own comment says: "from a sibling
  container use the Docker bridge gateway"). Corrected by actually
  running the check:
  - Booted `apps/api-idp` for real against
    `postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt`.
  - `POST /auth/login` with the seeded `owner` / `DevPass123!` account
    (`packages/infra-db/src/users/seed.ts`'s `DEV_PASSWORD`) returned a
    real `{accessToken, refreshToken, user}`.
  - `POST /auth/refresh` with that real refresh token returned a real
    `{accessToken, refreshToken}` — confirming the exact shape
    `refreshSession` already assumed.
  - Ran this repo's ACTUAL `session.server.ts` (`isTokenExpired`,
    `createSession`, `getSession`, `refreshSession`) via `tsx` against
    the live server, not curl: `createSession`/`getSession` round-tripped
    the real tokens, and `refreshSession` completed against the real
    `/auth/refresh` endpoint and produced a session whose new access
    token was not expired. (The new access token was byte-identical to
    the old one because both logins landed in the same integer second —
    HS256 JWTs with identical claims sign identically; the refresh
    TOKEN's `rtid` claim differed, proving the server actually rotated
    it, so this is a same-second artifact, not a bug.)
  - `apps/api-idp` process stopped afterward.

  **6.3's done-criterion is met.** The earlier "still owed" note is
  withdrawn.

  **Correction to THIS batch's own "nothing left running" claim**: the
  `kill <pid>` above only killed `pnpm exec nest start`'s wrapper
  process — Nest's actual `node .../api-idp/dist/main` child survived as
  an orphan, still bound to port 3002, undetected until 6.4's manual
  check below started a second `api-idp` and hit `EADDRINUSE`. Fixed by
  killing the process found via `pgrep -fa`, not the backgrounded
  shell's `$!`, and by verifying with `pgrep` AND a port check afterward
  — not by assuming a `kill` on a wrapper PID succeeded.

- [x] 6.4 `apps/web-catalog/app/shared/lib/auth.guards.server.ts` —
      `withAuth` ONLY (D7: no `withRoles`/`withPublicRedirect`/
      `withOptionalAuth`). `admin/login`/`admin/logout` registered as
      siblings of `layout('shared/routes/_auth.tsx', [...])` in
      `app/routes.ts`, never inside it (design §6 — one app, so login
      can't guard itself). `frozenStorefrontBoundaryRule` was already
      wired into `web-catalog/eslint.config.mjs` (Phase 5's scaffold) —
      no change needed, done-criterion ("`pnpm --filter web-catalog lint`
      passes at `--max-warnings 5` with the new rule active") already
      held and still holds (3/5 warnings). 15 new tests
      (`auth.guards.server.test.ts`, `login.test.tsx`, `logout.test.tsx`).
      1 commit.

  **Bug caught by `tsc`, not by review**: `withAuth`'s loader parameter
  was typed to return `unknown`, which erased the wrapped loader's real
  return type through the wrapper. `react-router typegen`'s inference for
  `admin/routes/index.tsx`'s `loaderData` came out possibly-`undefined`
  as a result. Fixed by making `withAuth<T>` generic over the loader's
  actual return type.

  **Beyond the done-criterion — a real, live manual smoke test** (not
  required by 6.4's stated criterion, but the owner asked this session to
  verify infrastructure claims for real rather than assume, so the same
  discipline applied here): booted `api-idp` (real Postgres) AND
  `web-catalog`'s own dev server (`react-router dev --port 3010`,
  `SESSION_SECRET`/`API_IDP_URL` set), then drove the actual HTTP flow
  with `curl` against a real `Host: default.localhost:3010` (the app
  404s on a bare `Host: localhost` — D9's tenant resolution, expected,
  not a bug):
  1. `GET /admin` with no cookie → `302` to
     `/admin/login?returnTo=%2Fadmin`.
  2. `GET /admin/login` → `200`, real form (`name="login"`,
     `name="password"`).
  3. `POST /admin/login` with the seeded `owner`/`DevPass123!` → `302` to
     `/admin`, real `Set-Cookie`.
  4. `GET /admin` with that cookie → `200`, renders "Sesión activa:
     d59fdd3a-ba44-4d08-a640-0a790fc947d0" — the REAL user id from the
     REAL login response, proving `withAuth` → `_auth.tsx` →
     `admin/routes/index.tsx`'s `loaderData` round-trips correctly.
  5. `POST /admin/logout` → `302` to `/admin/login`, `Set-Cookie` with
     `Expires=Thu, 01 Jan 1970...` (cookie cleared).
  6. `GET /admin` again with the now-stale cookie → `302` back to
     `/admin/login?returnTo=%2Fadmin` — logout actually destroyed the
     session, `withAuth` doesn't trust a stale cookie.
  Both dev servers stopped afterward and verified dead by `pgrep` AND a
  TCP connect check on both ports (3002, 3010) — not by trusting the
  `kill` exit code alone, per the correction immediately above.

- [x] 6.5 RED+GREEN: `/admin/productos[/nuevo|/:id/editar]` —
      create/edit/soft-delete; 403 render on cross-company mutation
      attempt; no store-switcher UI. 2 commits (`5c12a7e` api-idp,
      `540d224` web-catalog).

  **Design gap found and resolved before any route code could be
  written**: `api-salesops`'s `TenantContextGuard` requires
  `X-Company-Id` explicitly, or falls back to the caller's SOLE active
  `Membership` — ambiguous once an admin belongs to >1 company
  (catalog-admin spec's own "no store-switcher" scenario admits this
  case exists). No endpoint anywhere resolved a slug to a company id
  with only a JWT (verified exhaustively via a dedicated exploration
  agent — checked `api-idp`'s login/signup responses, both apps'
  `CompanyController`s, and every membership-shaped route). Presented
  the owner two options (`GET /companies/:slug` on `api-idp` vs.
  `GET /users/me/memberships`); owner chose the slug endpoint. Added
  `GET /companies/:slug` to `api-idp` (`JwtAuthGuard` only, returns
  `{id, slug, name}` — never the full `Company` row), and
  `company.server.ts`'s `resolveCompanyId` in `web-catalog`. `withAuth`
  now resolves `companyId` once per request (after any token refresh)
  and passes it to every guarded loader/action; `makeAuthenticatedRequest`
  gained a `companyId` parameter, attached as `X-Company-Id`.

  **Built**: `app/admin/lib/{products,categories}.server.ts` (thin
  CRUD clients — a non-ok response is thrown as the RAW `Response`,
  never parsed into a generic error, so callers can inspect the exact
  status). `/admin/productos` (list), `/admin/productos/nuevo`
  (create), `/admin/productos/:id/editar` (update + soft-delete, one
  hidden `intent` field distinguishes the two mutations) — all
  `withAuth`-guarded, nested under `_auth.tsx`. `image` is a raw ref
  path text field, matching `api-salesops`'s current `CreateProductDto`
  contract exactly — the upload UI that fills it in for the admin is
  task 6.7, not this one. 17 new tests across `company.server.test.ts`,
  `api.server.test.ts` (extended), `auth.guards.server.test.ts`
  (extended), `products.server.test.ts`, `categories.server.test.ts`,
  and the three route test files.

  **6.5's explicit done-criterion** — "cross-company mutation test
  asserts rejection, never silent apply to either company" — is
  covered by `editar.test.tsx` for BOTH the update and soft-delete
  mutations: a `403` from `api-salesops` (`TenantContextGuard`
  rejecting a caller with no active membership in the resolved
  `companyId`) returns a plain `{error}` object, never a
  `Response`/redirect — asserted explicitly with
  `expect(result).not.toBeInstanceOf(Response)` — so a failed mutation
  can never be mistaken for a successful one. Two more tests in the
  same file prove the 403 tests aren't a blanket failure: a same-company
  update/delete still succeeds and redirects normally.

  **Beyond the unit tests — a real, live create→edit→delete cycle**:
  booted `api-idp`, `api-salesops`, AND `web-catalog`'s own dev server
  for real, logged in as the seeded `owner`, and drove the full admin
  flow with `curl` against `Host: default.localhost:3010`: `GET
  /admin/productos` (real empty-state render, real `companyId`
  resolution, real `api-salesops` call) → `POST .../nuevo` (created a
  real product row, verified via direct SQL against the tenant
  schema — `store_mgmt_tenant_459ae1f5_...`) → `POST .../editar` (name
  and `order` changed) → `POST .../editar` with `intent=delete`
  (`active` flipped to `false`, row still exists — never a hard
  delete). Verified the final row directly via SQL after all three
  steps. Test artifact removed afterward (direct `DELETE` on the row I
  created — cleanup of my own test data, not a violation of the
  app's own soft-delete-only discipline, which governs the
  APPLICATION's behavior, not ad-hoc verification cleanup). All three
  dev servers verified dead by `pgrep` AND a port check on 3001, 3002,
  3010.

  **Also**: removed the unused `Route.MetaArgs` parameter from every
  route's `meta()` export across the whole app (was `_args`, now no
  parameter) — this batch's new routes would have pushed the lint
  count from 3 to 8 against the `--max-warnings 5` budget; fixing the
  pattern everywhere brought it back to 0.

- [x] 6.6 RED+GREEN: `/admin/categorias[/nueva|/:id/editar]` — same
      discipline as 6.5's product CRUD: list/create/edit/soft-delete,
      `companyId` resolved once by `withAuth` and threaded through every
      mutation so a cross-company request is rejected server-side, never
      silently applied to either company. Delete is always soft
      (`active=false`), never hard. 1 commit (`474a7c9`).

  **Built**: `app/admin/lib/categories.server.ts` (extended with
  create/update/delete methods, same raw-`Response`-on-error pattern as
  6.5's `products.server.ts`), `admin-api.types.ts` (category DTOs added),
  `app/admin/components/category-form.tsx` (shared create/edit form,
  mirrors `product-form.tsx`), `/admin/categorias` (list),
  `/admin/categorias/nueva` (create), `/admin/categorias/:id/editar`
  (update + soft-delete, one hidden `intent` field distinguishes the two
  mutations, same shape as 6.5). 11 files changed, +766/-7 lines. New
  tests: `categories.server.test.ts` (extended), `editar.test.tsx`,
  `index.test.tsx`, `nuevo.test.tsx` — cross-company rejection asserted
  the same way as 6.5 (`expect(result).not.toBeInstanceOf(Response)`
  never true on a 403), plus a same-company update/delete control case
  proving the 403 tests aren't a blanket failure.

- [x] 6.7 RED+GREEN: admin image-upload UI action — wires `POST
      /products/:id/image` (task 3.2) into `/admin/productos/:id/editar`
      via a new multipart `Form` (`intent=upload-image`),
      `uploadProductImage` added to `products.server.ts`. Success
      redirects back to the same edit route so the loader re-fetches and
      the displayed image ref reflects the new upload — this IS the
      mechanism live-verified end to end in Phase 7's 7.4 smoke test
      (upload survives a fresh page load, confirmed via direct SQL and
      on-disk file check). 1 commit (`dad4e27`).

  **Built**: `editar.tsx` gained the multipart upload form alongside the
  existing product-edit form (two distinct actions on one route,
  distinguished by `intent`, same pattern 6.5/6.6 already established for
  update-vs-delete). 4 files changed, +191/-5 lines. New test:
  `editar.test.tsx` (extended) covers a successful upload, a rejected
  upload (propagates `api-salesops`'s 413/400 as a plain error, never a
  silent no-op), and confirms a failed upload never touches the product's
  other fields.

**All 7 Phase 6 work units complete** (6.1-6.7), matching tasks.md's plan.
`apps/web-catalog` full suite: 126→146 tests (+9 `categories.server.test.ts`
extended, +4 `nuevo.test.tsx`, +4 `editar.test.tsx`, +2 `index.test.tsx` for
6.6; +5 `editar.test.tsx` extended for 6.7). `tsc --noEmit` clean. Lint: 0
errors, within budget.

## Completed Tasks (Phase 7 — final verification)

- [x] 7.1 `pnpm turbo run lint typecheck test` (from `templates/`), full
      monorepo: 42/42 turbo tasks green, 0 lint errors anywhere, 0
      typecheck errors across all 12 packages/apps. Every suite's test
      count reconciled against its last-documented baseline (see the
      table in engram `sdd/public-catalog/apply-progress` #2147) —
      `domain` 341/341, `infra-db` 437/437, `infra-storage` 14/14,
      `api-common` 45/45 (untouched, confirms D3), `api-public` 60/60
      (NEW app), `api-salesops` 495/495, `api-idp` 71/71, `storefront`
      43/43 (frozen, untouched), `web-common` 11/11 (untouched),
      `static-store` 96/96, `web-catalog` 146/146, `salesops-mvp` 534/534
      (untouched legacy app). e2e (run separately, not covered by `turbo
      run test`): `api-public` 5/5, `api-salesops` 125/125, `api-idp`
      13/13. Zero regressions anywhere. 7.1 surfaced no bugs, so no fix
      commit was needed for this task.
- [x] 7.2 Diff audit against `main` (`git diff main...public-catalog`):
      `packages/storefront` and `packages/api-common` both empty diffs
      (zero changes, frozen packages untouched); `apps/static-store` only
      the 2-line `frozenLegacyAppRule` wiring from task 1.8, no other file
      touched; `apps/api-idp/package.json` diff empty (zero new
      dependencies, transitive or direct) — its source diff is entirely
      the 6.5 `GET /companies/:slug` endpoint. Whole-change diff stat: 162
      files changed, +10346/-18 at the time of this task (grew to 172
      files, +13095/-18 once 6.6/6.7 landed after this count was taken —
      consistent growth, not a discrepancy).
- [x] 7.3 Manual smoke test (public storefront), real dev servers
      (`api-public`, `web-catalog`) against real dev Postgres
      (`172.17.0.1:5432`), seeded tenant `default` (101 products, 12
      categories): search, category filter, sort+pagination all verified
      via `curl` at both the `api-public` and `web-catalog` SSR layers;
      D4's byte-identical 404 re-confirmed live (unknown slug vs.
      temporarily-deactivated company, diffed raw response bodies, zero
      differences). All test infrastructure (temp inactive-company row,
      both dev server process groups) cleaned up and verified dead
      (`pgrep` + TCP-connect probe) afterward.
- [x] 7.4 Manual smoke test (admin), real dev servers (`api-idp`,
      `api-salesops`, `web-catalog`) against the same real dev Postgres:
      logged in as the seeded `owner` account, full product CRUD
      (create → 6.7's image upload, confirmed surviving a fresh page load
      via direct SQL AND an on-disk file check at `STORAGE_PATH` →
      update → soft-delete, SQL-confirmed `active=false` with the row
      still present) and full category CRUD (create → update → soft-delete,
      same SQL-confirmed pattern) both exercised live, not just via unit
      tests. DB restored to its exact pre-test row counts afterward
      (product 101, category 12, company 1); all three dev server process
      groups verified dead by `pgrep` and a port check.

**All 4 Phase 7 tasks complete.** 1 commit (`19baa4e`, docs-only — 7.1
surfaced zero regressions, so no fix commit was needed). THE ENTIRE
public-catalog CHANGE (Phase 0 through Phase 7) IS IMPLEMENTATION-COMPLETE.
Full detail (exact commands, exact response bodies, exact SQL queries) is
preserved in engram `sdd/public-catalog/apply-progress` (#2147) — this
section summarizes it here so the committed file is self-sufficient and
does not depend on engram to prove Phase 7 happened.

## Spike Results (PASS/FAIL with evidence) — Phase 0

### Spike 0.1 — Wildcard subdomain Host header: **PASS**

`apps/api-public` (NestJS/Express): no config change needed — Express does not
validate the `Host` header.
```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3003/health
< HTTP/1.1 200 OK
{"status":"ok"}
```

`apps/web-catalog` (React Router 7 SSR via Vite): required ONE config fix —
`resolve.alias: { 'react-router-dom': 'react-router' }` in `vite.config.ts`
(same fix `static-store` already carries), because this template is nested
inside a legacy repo whose root `node_modules` has `react-router-dom@6`,
which Vite's dep-scanner phantom-resolved and crashed on
(`UNSAFE_useRouteId` missing export). This is a config fix, not a redesign,
per the task's own instruction. `server.allowedHosts` was NOT needed — Vite
never rejected the custom Host header in the first place.
```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3000/
< HTTP/1.1 200
<p data-testid="host">Host: default.localhost:3000</p>
```
Documented in `apps/api-public/README.md` and `apps/web-catalog/README.md`.

### Spike 0.2 — Guard schema-independence: **PASS**

`packages/infra-db/src/company/prisma-master-independence.spec.ts` calls the
EXISTING `PrismaCompanyRepository.findById` against real Postgres
(`store_mgmt_test`) with no `TenantContextService.run(...)` wrapper anywhere
in the file. Both assertions (found + null-for-unknown-id) pass.
```
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```
Confirms design.md D2's foundational claim empirically: the public tenant
guard needs no scope of its own. Existing `prisma-company.repository.spec.ts`
suite (9 tests) re-run as a safety net — still green, zero edits.

### Spike 0.3 — `sharp` toolchain: **PASS**

`pnpm --filter @store-mgmt/infra-storage add sharp` resolved `sharp@0.35.3`
cleanly — prebuilt `linux-x64` binary, no `node-gyp` build step, no peer
conflicts, no ignored postinstall scripts. Smoke script
(`scripts/sharp-smoke.mjs`) runs the exact `rotate → resize → webp` chain
Phase 2's `normalize-image.ts` will use, against an in-memory buffer:
```
PASS: sharp decode -> rotate -> resize -> webp round trip produced 44 bytes of valid WebP.
```
Install size ~19 MB total (mostly the prebuilt `libvips` binary, one-time
per platform). Documented in `packages/infra-storage/README.md`.

### Spike 0.4 — `MN` formatter: **PASS**

RED (`money.test.ts`) failed first because `./money` didn't exist
(`Failed to resolve import "./money"`). GREEN (`money.ts`) implements
`formatMoney(amount: string, {locale, currency})`:
- `MN` → `Intl.NumberFormat` WITHOUT `style:'currency'` (that's what throws)
  plus a `" MN"` suffix.
- Any other currency (`USD`, `EUR`, ...) → standard
  `Intl.NumberFormat(locale, {style:'currency', currency})`, memoized per
  `locale|currency` pair (mirrors the frozen, read-only-reference
  `packages/storefront/src/config/money.ts` pattern — never imported, D9).
```
Test Files  1 passed (1)
     Tests  5 passed (5)
```

## Phase 1 Evidence

### 1.1-1.2 — `ICompanyRepository.findBySlug`: **PASS**

RED: 2 new assertions in `prisma-company.repository.spec.ts` fail with
`TypeError: repository.findBySlug is not a function`.

GREEN: additive `findBySlug(slug)` on the port + `PrismaCompanyRepository`
implementation (`prisma.company.findUnique({ where: { slug } })` — `slug`
already `@unique`, no migration).
```
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total   (9 pre-existing + 2 new)
```
Full `infra-db` suite re-run: 47/47 suites, 437/437 tests passing (was
435 before this batch — 2 new tests, zero regressions).

### 1.3-1.4 — `IProductImageStore` port: **PASS**

RED: `product-image-store.port.test.ts` fails —
`Cannot find module './product-image-store.port.js'`.

GREEN: `product-image-store.port.ts` created — `IProductImageStore`
(`put`/`open`), `PutProductImageInput`, `ProductImageContent`,
`PRODUCT_IMAGE_STORE` symbol, `assertProductImageRef` +
`InvalidProductImageRefError`, all in one file (design.md D1), zero
filesystem/adapter code. Exported from `packages/domain/src/product/index.ts`.
```
Test Files  32 passed (32)
     Tests  341 passed (341)   (333 pre-existing + 8 new)
```

### 1.5-1.6 — `search` filter: **PASS**

RED: new `list() search does a case-insensitive OR...` test fails — result
includes an unrelated product because `search` was silently ignored by the
pre-change `list()` implementation.

GREEN: additive `ProductListFilter.search?: string` on the port;
`PrismaProductRepository.list` adds an `OR` of two `contains` +
`mode: 'insensitive'` Prisma clauses, only when `search` is set.
```
Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total   (7 pre-existing + 2 new)
```
Full `infra-db` suite re-run: 47/47 suites, 437/437 tests passing. Diff of
`prisma-product.repository.spec.ts` reviewed — confirmed purely additive,
zero edits to any pre-existing assertion.

### 1.7 — Frozen-boundary eslint rules: **PASS** (manual verification, no test harness for this package — repo convention)

`frozenStorefrontBoundaryRule` and `frozenLegacyAppRule` added to
`backend-boundaries.config.js`, exported alongside the existing rules.
Verified:
- Node ESM smoke-import of the module confirms both new exports resolve
  (`'frozenStorefrontBoundaryRule' in m` / `'frozenLegacyAppRule' in m` →
  both `true`).
- Re-ran `pnpm lint` for every existing consumer of this file (`domain`,
  `infra-db`, `salesops-mvp`, `api-salesops`, `static-store`) — 0 errors in
  all five, same pre-existing unrelated warnings as before this change (the
  rules are exported but not yet wired into any app's own
  `eslint.config.mjs`, so they cannot fire yet).

### 1.8 — Wire `frozenLegacyAppRule` into `static-store`: **PASS**

One-line addition (import + array entry) to
`apps/static-store/eslint.config.mjs`, mirroring the existing
`webBackendBoundaryRule` wiring. Both done-criteria verified explicitly:

**Lint — 0 new violations:**
```
$ pnpm --filter static-store lint
...
✖ 5 problems (0 errors, 5 warnings)
```
Identical file/line/rule set before and after the edit (3 pre-existing
`no-unused-vars` warnings in `home.tsx`/`product-detail.tsx`/`products.tsx`
+ 2 pre-existing `turbo/no-undeclared-env-vars` warnings in
`build-pages-verticals.mjs`). Exit code 0 (within `--max-warnings 5`).
`static-store` has zero `@store-mgmt/domain` imports in its source today
(confirmed via `rg -n "@store-mgmt/domain"` across the app, only match is
the `package.json` dependency declaration — never imported in code), so the
new rule fires on nothing.

**Build — byte-identical output:**
```
$ rm -rf build .react-router && pnpm build   # BEFORE the edit
$ find build -type f | sort | xargs sha256sum > /tmp/.../static-store-build-before.sha256
# 188 files hashed

$ (edit eslint.config.mjs)

$ rm -rf build .react-router && pnpm build   # AFTER the edit
$ find build -type f | sort | xargs sha256sum > /tmp/.../static-store-build-after.sha256
# 188 files hashed

$ diff static-store-build-before.sha256 static-store-build-after.sha256
$ echo $?
0
```
`diff` reports zero differences across all 188 output files (same paths,
same content hashes) — the frozen app's shipped artifact is byte-identical
before and after task 1.8's edit.

## Phase 2 Evidence

### 2.1-2.2 — `FsProductImageStore`: **PASS**

Implemented by a previous batch (commit `88c69d1`). RED
(`fs-product-image.store.spec.ts`): put→open round trip on a tmpdir; `open()`
returns `null` for a well-formed ref that resolves to nothing on disk; ref
rejection reuses 1.3/1.4's `assertProductImageRef` for `..`, absolute paths,
and backslashes; extension derived from a `declaredMimeType` allowlist
(never a filename — `PutProductImageInput` has no filename field at all);
per-company scoping proven (company B cannot open company A's ref via the
identical ref string).

GREEN: `FsProductImageStore implements IProductImageStore`. Resolves every
ref under `<basePath>/<companyId>/<ref>`; `basePath` defaults to
`process.env.STORAGE_PATH ?? resolve(process.cwd(), 'storage')`. `open()`
streams via `createReadStream` (never buffers, D6/D1). Dropped the spike-0.3
`"type": "module"` scaffold in favour of `infra-db`'s CJS/nodenext
convention after tracing a real Jest/ts-jest ESM-vs-CJS interop failure to
it.

**Recovery note**: the agent that wrote 2.1/2.2 stalled before committing.
The orchestrator reviewed the diff, verified `pnpm --filter
@store-mgmt/infra-storage test` was green, and committed the work as
`88c69d1` — no code was rewritten, only reviewed and landed.

### 2.3-2.4 — `normalizeImage`: **PASS**

Implemented by a previous batch (commit `fc98d4e`). RED
(`normalize-image.spec.ts`): a real EXIF orientation tag is written (without
applying the rotation) and the test asserts both that the pixel dimensions
swapped AND that the tag was stripped — a tag left behind would make an
EXIF-aware viewer rotate the image a second time; output is always webp
regardless of input format; an oversize source is downscaled to
`width:1600` with `withoutEnlargement:true` so a small source is never
upscaled; non-image input decodes to `UnsupportedImageError`, never an
uncaught throw that could crash the process (design.md D10).

GREEN: `normalizeImage(bytes)` — the only file in the package importing
`sharp`: `.rotate()` (auto-orient from EXIF, then strip the tag) →
`.resize({width:1600, withoutEnlargement:true})` → `.webp({quality:82})`.

**Recovery note**: same as 2.1/2.2 — the previous agent stalled before
committing; the orchestrator reviewed, confirmed the suite was green, and
committed as `fc98d4e`.

Baseline confirmed by this batch before starting 2.5/2.6:
```
$ pnpm --filter @store-mgmt/infra-storage test
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

### 2.5 — Process-restart persistence proof: **PASS**

RED: `restart-proof.spec.ts` written first, referencing
`scripts/restart-proof-write.js` and `scripts/restart-proof-read.js`, which
did not exist yet. Confirmed failing:
```
Error: Cannot find module '.../scripts/restart-proof-write.js'
Test Suites: 1 failed, 1 total
Tests:       1 failed, 1 total
```

GREEN: created both scripts (plain CommonJS `.js`, not `.ts` — they run as
literal `node <script>` OS processes, never transformed by ts-jest) and a
`beforeAll` in the spec that rebuilds `dist/` via the package's own `tsc` so
the proof always runs against fresh compiled output, never a stale or
missing prior `pnpm build`.

The spec spawns TWO real, separate `node` processes via `execFileSync`:
1. `restart-proof-write.js <basePath> <companyId>` — constructs
   `FsProductImageStore` against a FIXED path
   (`packages/infra-storage/.storage-restart-proof/`, never a tmpdir), calls
   `put()` with a fixed literal payload, prints the resulting ref to stdout,
   exits. `execFileSync` blocks until this process has genuinely terminated
   — this IS the "process has died" half of the proof.
2. Only then, `restart-proof-read.js <basePath> <companyId> <ref>` — a
   brand-new, unrelated `node` invocation with no shared memory or module
   cache with process 1. Constructs its OWN `FsProductImageStore` against
   the same fixed path, calls `open()`, drains the stream, prints the bytes
   (base64) to stdout.

The parent test asserts the second process's output decodes to the exact
literal payload the first process wrote.
```
$ pnpm --filter @store-mgmt/infra-storage test -- restart-proof
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```
Full package suite after adding this spec:
```
$ pnpm --filter @store-mgmt/infra-storage test
Test Suites: 3 passed, 3 total
Tests:       14 passed, 14 total
```
Cleanup: `beforeEach`/`afterAll` hooks `rm(basePath, {recursive:true,
force:true})` — verified with `ls .storage-restart-proof` (No such file or
directory) and `git status --porcelain` after a run: no stray files.
`templates/.gitignore` gained one entry
(`packages/infra-storage/.storage-restart-proof`) as defense-in-depth in
case a run is killed mid-proof.

**What this proves**: bytes written through `FsProductImageStore.put()`
under a fixed path outlive the OS process that wrote them — the mechanism
`api-salesops` (writer, Phase 3) and `api-public` (reader, Phase 4) actually
depend on, as two genuinely separate Node processes.

**What this does NOT prove**: persistence across a CONTAINER restart. That
requires the container's filesystem to be backed by a mounted volume at
`STORAGE_PATH` — a process restart on the same disk is a necessary but not
sufficient stand-in for a container restart; they're only equivalent when a
volume is actually mounted. This distinction is stated explicitly in
`packages/infra-storage/README.md`, not left for a reader to infer.

### 2.6 — Container-volume-mount scope note: **PASS** (documentation task, no code)

`packages/infra-storage/README.md` records, as a declared and explicit gap
(not silently dropped): the full container-volume-mount proof (a
`docker-compose` service definition mounting a volume at `STORAGE_PATH`,
then killing/recreating the CONTAINER — not just the process — to prove the
volume survives) is not implemented in this repo. Verified before writing
the note:
```
$ rg -n "docker-compose|compose\.ya?ml" --type-not md . 2>/dev/null
```
No `docker-compose` file wires `api-public`, `api-salesops`, or
`web-catalog` anywhere in this repository, and design.md §4's file map does
not name one either — matches the task's own premise. README states what a
future deployment must provide (`STORAGE_PATH` pointed at a mounted volume,
identical value in both the writer and reader apps) and the concrete risk of
skipping it (a container recreate silently discards uploaded images while
`Product.image` DB rows keep pointing at refs that no longer exist).

## Phase 3 Evidence

### 3.1-3.2 — `POST /products/:id/image`: **PASS**

RED confirmed first: ran `pnpm test -- product.controller` before adding any
production code — 15/15 pre-existing tests green (safety net), then added 7
new cases against the not-yet-existing route; all 7 failed (404, either
"route doesn't exist" or, for the reverse-hostile case, a masked 404 from an
unconfigured `findById` mock — caught and fixed in the RED step itself by
adding the missing mock). GREEN: implemented `uploadImage()` — two chained
`ParseFilePipe`s so size and MIME failures map to DISTINCT status codes
(`MaxFileSizeValidator` → 413, `FileTypeValidator` → 400, design.md's
testing-strategy bullet: "oversize -> 413; non-image -> 400"), `@Roles(owner,
admin)`, `findById` 404-if-absent inside `runInTenant`, then
`normalizeImage()` → `productImageStore.put()` →
`productService.update(id, {image: ref})`. All 22 tests green
(`pnpm test -- product.controller`), zero edits to any of the 15 pre-existing
assertions.

**Design deviation, documented not silent — `FileTypeValidator` default
behaviour**: design.md D10 states "FileTypeValidator inspects the
client-supplied Content-Type; calling it the security boundary is wrong" —
true for the Nest version D10 was written against, but the INSTALLED
`@nestjs/common@11.1.28` ships `FileTypeValidator` with REAL magic-number
sniffing (`file-type` npm package) enabled BY DEFAULT
(`skipMagicNumbersValidation` defaults to `false`). Left at the default, the
pipe would become a SECOND independent content-decoding gate, splitting a
hostile upload's rejection between two unrelated decoders and contradicting
D10's own "sharp is the ONE real gate" premise — and the user's explicit ask
that the hostile-content case be "rejected by sharp's decode (D10)," not by
a second library. Fix: `new FileTypeValidator({ fileType: ..., skipMagicNumbersValidation: true })`
restores the pipe to D10's intended "cheap client-declared-Content-Type
filter" role, leaving `normalizeImage`'s `sharp` call as the sole real
content gate. Verified by construction: the reverse security test (garbage
bytes, honest `image/jpeg` Content-Type header) passes the pipe and is
rejected only by `sharp`'s decode failure, mapped to 400 via
`withDomainErrorMapping`'s `UnsupportedImageError` branch.

**Design deviation, documented not silent — response status code**: design.md
§5's end-to-end narrative writes `-> 200 {id, imageUrl}`. Initial
implementation used `HttpStatus.CREATED` (201, mirroring `POST /products`'
convention); corrected to `HttpStatus.OK` (200) to match design.md's literal
contract once caught in self-review — `POST /products/:id/image` updates an
EXISTING product's `image` field, it does not create a new resource, so 200
is also the more accurate REST semantic. Response BODY returns the full
`ProductResponseDto` (matching every other write endpoint in this controller
— `create`/`update` both return it) rather than a narrower `{id, imageUrl}`
shape: no component in Phase 3's scope assembles a public "imageUrl" at all
(`image-url.ts`'s cache-key/URL-assembly logic is explicitly owned by
`apps/api-public`, design.md's own file map, not built until Phase 4) — an
`imageUrl` field on this response would either be undefined behaviour or
would require api-salesops to duplicate api-public's URL-assembly logic,
which the file map's ownership split does not intend. `Product.image` (the
stored ref) IS present on the returned body, satisfying the spec's literal
acceptance criterion ("`Product.image` is updated to the stored relative
path").

### 3.3 — `product.module.ts` wiring: **PASS, exposed a Phase-2-origin DI bug**

Adding `imports: [InfraDbModule, InfraStorageModule]` is itself a one-line
change, but it is the FIRST time in this feature that `InfraStorageModule`
(created Phase 2) is pulled into a REAL NestJS DI container — Phase 2's own
suite always called `new FsProductImageStore(basePath)` directly, never
through `InfraStorageModule`'s `{ provide: PRODUCT_IMAGE_STORE, useClass:
FsProductImageStore }` binding. Running `pnpm test:e2e` after wiring failed
ALL 10 e2e suites (not just product's) with `Nest can't resolve dependencies
of the FsProductImageStore (?)... argument String at index [0]` — because
`AppModule` wires every controller/module together, one module failing to
instantiate breaks the WHOLE app's DI graph. Root cause:
`FsProductImageStore`'s constructor (`constructor(basePath: string =
defaultStoragePath())`) has no `@Inject`/`@Optional` annotation, so
`emitDecoratorMetadata` reports the param's design-time type as bare
`String`, and Nest's DI tries (and fails) to resolve a provider for that
token instead of ever reaching the JS default value. This is the EXACT same
class of bug `TenantPrismaFactory`'s constructor already documents
(`packages/infra-db/src/tenant/tenant-prisma-factory.ts:98-114`) — a latent
Phase 2 defect this phase's wiring was the first to surface, not something I
introduced. Fix: added `@Optional()` to the `basePath` parameter in
`packages/infra-storage/src/product-image/fs-product-image.store.ts` (5-line
change + comment), mirroring the established codebase precedent exactly.
Re-ran `packages/infra-storage`'s own suite after the fix (14/14 green,
zero edits) to prove the fix didn't change the class's direct-construction
behaviour, then re-ran `api-salesops`'s `test:e2e` — all 10 suites, 125/125
tests green again, matching the pre-Phase-3 baseline exactly. This fix
touches ONLY `packages/infra-storage` (not frozen) and zero test files.

### 3.4 — Regression proof: **PASS**

Baseline captured BEFORE any Phase 3 code: `pnpm test` (api-salesops)
25 suites / 486 tests green; `pnpm test:e2e` 10 suites / 125 tests green
(after building `domain`/`infra-db`/`infra-storage` to `dist/` first — the
e2e suite runs against the BUILT workspace deps, not source). After Phase 3:
`pnpm test` 25 suites / 493 tests green (+7, all new, zero suites added or
removed); `pnpm test:e2e` 10 suites / 125 tests green (identical count —
zero suites/tests added, since Phase 3 added no e2e spec, only unit/
controller-level tests per tasks.md's literal scope for this phase). Lint
(`--max-warnings 0`) and `tsc --noEmit` both clean on `api-salesops` and on
`packages/infra-storage`.

## Phase 4 Evidence

### 4.1-4.2 — `host-slug`: **PASS**

RED confirmed by running the spec before `host-slug.ts` existed:
`Could not locate module ./host-slug.js`. GREEN: pure function, no Nest/
Express import — 12 tests covering the full D2 parse table (two-label
resolve, port stripping, `X-Forwarded-Host` preference over `Host`,
single-label rejection, all 3 reserved labels, disallowed chars, leading
hyphen, case-insensitivity, both-headers-absent).
```
Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### 4.3-4.4 — `PublicTenantGuard` + `run-in-tenant.ts`: **PASS**

RED confirmed by temporarily removing the just-written `public-tenant.guard.ts`
and re-running the spec (`Could not locate module`), then restoring it —
done explicitly because the spec and guard were authored in the same pass
and this is the honest way to prove RED still held. GREEN: 8 tests,
including the byte-identical-404 proof, run against a REAL Nest
`TestingModule` + `supertest` HTTP server (not just comparing thrown
exception objects) — response `status`, `body`, and every header except
`Date` are asserted equal across the unknown-slug, inactive-company, and
`schemaName: null` branches. A dedicated test also asserts the guard's own
source never imports `@store-mgmt/api-common` (D3), and another proves the
guard succeeds with no `req.user` ever set and no `MEMBERSHIP_REPOSITORY`/
`PassportModule` in the `TestingModule` — compiling at all is part of the
proof (if the guard depended on the authenticated chain, `.compile()` would
have thrown first).
```
Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
```
Discovered mid-batch: `import.meta.url` breaks this codebase's ts-jest
setup (it compiles to CommonJS; a file using `import.meta` forces ESM
output for just that file, producing `ReferenceError: exports is not
defined`). Fixed by using `__dirname`/`node:path` instead — the same
pattern every other file in this repo already uses.

### 4.5-4.6 — `PublicProductService`: **PASS**

RED: `Could not locate module ./public-product.service.js`. GREEN: 7 tests.
The core triangulating fixture deliberately makes `Product.order` and
`finalPrice` DISAGREE (`X`: order 5, 50% off → cheaper; `Y`: order 1, no
discount → pricier) so that `orden=precio-asc` ranking `X` before `Y` proves
`finalPrice` — not the featured order — actually drives the sort. A second
fixture proves the mirror case for `precio-desc`, and a third proves
`destacado` still uses `Product.order`. Page-boundary test: 13 products,
`orden=precio-asc`, `pageSize=12` — page 1 has exactly 12 items/`total: 13`/
`pageCount: 2`; page 2 has exactly 1 item, and it's specifically the
13th-ranked product by `finalPrice` (not merely "some product"). A
beyond-the-end page returns `items: []` with `total` still exact. An unknown
`categorySlug` short-circuits to an empty result and the test asserts
`productRepository.list` was NEVER called — locking in "no wasted/wrong
query" as part of the contract, not just the visible output.
```
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

### 4.7-4.8 — DTO contract + public endpoints: **PASS**

RED confirmed for all three new controller specs simultaneously (product,
category, store) — each failed on `Could not locate module`. GREEN: 22 new
tests across the three controllers (product: 13, category: 2, store: 2,
plus the pre-existing guard/service/host-slug specs untouched). The DTO
contract test asserts `Object.keys(item).sort()` against the exact,
alphabetized §3 allow-list — a key-set equality, not a list of
`not.toHaveProperty` calls, so no field can silently reappear if a future
edit widens the mapper. A companion test builds the fixture with **non-null**
`sku`/`barcode`/`cost` specifically so the absence proof is "the mapper never
copies these fields" rather than "the fixture happened to leave them empty".
Value-type assertions cover every §3 row: `percentDiscountPrice`/
`discountPrice`/both `Money.amount`s are `typeof === 'string'` with EXACT
expected values (`"20.00"`, `"5.00"`, `"100.00"`, `"75.00"`), `order` is the
one `typeof === 'number'`, `isOffer`/`isNew` are booleans. Query-forwarding
tests confirm `q`/`categoria`/`orden`/`pagina`/`porPagina` reach the service
verbatim and that defaults apply when absent; `orden`/`porPagina` reject
unknown values with 400 (own-URL, a typo is a bug) while an out-of-range
`pagina` never 400s, matching the §3 table exactly.
```
Test Suites: 3 passed, 3 total (product, category, store controllers)
Tests:       22 passed, 22 total
```
One `turbo/no-undeclared-env-vars` lint warning surfaced
(`PUBLIC_ASSET_BASE_URL` used in `image-url.ts`) — fixed by adding it to
`turbo.json`'s `globalEnv` (additive, same pattern `STORAGE_PATH` already
uses).

### 4.9-4.10 — `ProductImageController`: **PASS**

RED: `Could not locate module ./product-image.controller.js`. GREEN: 8
tests covering every D6 branch — missing product (`store.open` never
called), stale `imageKey` (`store.open` never called), an invalid ref
(`assertProductImageRef` failure) mapped to 404 with a
`PRODUCT_IMAGE_REF_INVALID` log (asserted via a `Logger.prototype.error`
spy, not just the status code), `store.open()` returning `null` mapped to
404 with a `PRODUCT_IMAGE_MISSING` log, a matching `If-None-Match` producing
an EMPTY 304 body with the SAME `Cache-Control` header, and a fresh 200
whose headers are asserted individually (`Content-Type`, `Content-Length`,
`ETag`, `Cache-Control`, explicit absence of `Vary`/`Set-Cookie`) plus the
exact streamed byte content (two chunks from an async generator, concatenated
correctly — proves the `AsyncIterable` → `Readable.from` → `StreamableFile`
chain actually carries real bytes end to end). A dedicated test asserts
`store.open` is called with the resolved tenant's `companyId` EXPLICITLY
(D1), not read from anywhere ambient. `image-url.spec.ts` (8 more tests)
locks in `computeImageKey`/`assemblePublicImageUrl` — written in 4.7-4.8 to
satisfy the DTO's `imageUrl` field, so these are approval tests for
already-correct code, not a RED-first cycle for those two — plus genuine
RED/GREEN coverage for the new `imageKeyMatchesRef` staleness check.
```
Test Suites: 2 passed, 2 total (product-image.controller, image-url)
Tests:       16 passed, 16 total
```
One test fix needed: `response.text` is `undefined` for a binary
`Content-Type` (`image/webp`) — superagent parses it into `response.body`
as a `Buffer` instead. Fixed the assertion to check whichever one is
populated.

### 4.11 — Tenant isolation e2e: **PASS**

Ran against the REAL test database (`172.17.0.1:5432/store_mgmt_test`)
after building `packages/domain`, `packages/infra-db`, and
`packages/infra-storage` to `dist/` first (the e2e suite runs against the
BUILT workspace deps, exactly as the prompt's own warning flagged — skipping
this step would have made a green result meaningless). 5 tests, one booted
`AppModule`, one HTTP server, two real provisioned tenant schemas:
`GET /public/store` returns the correct, DIFFERENT store per `Host`;
`GET /public/products` for each store contains its own product and never the
other's; neither store's subdomain can read the other's product by its
EXACT real id (both directions asserted, plus a same-store sanity read to
prove the 404 is isolation and not a broken route); an unknown slug and a
freshly-provisioned inactive company 404 IDENTICALLY on the same running
instance; a real `orden=precio-asc` query against the real
`PrismaProductRepository`/`PublicProductService` pipeline (zero mocks)
returns the cheaper of two real seeded products first.
```
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```
Post-run hygiene check: queried the master DB directly for any leftover
`Company` row matching `slug: {contains: 'store'}` — **0 leftover companies**.
(One unrelated tenant schema remained in `information_schema.schemata`,
pre-existing from before this session — not created or left behind by this
batch's `dropStores` calls, which always ran in `afterAll`/`finally`.)

### Regression proof — everything outside `apps/api-public`: **PASS, byte-identical**

Re-ran every pre-existing suite this phase could plausibly have touched,
against the SAME baseline numbers this file already recorded:

| Suite | Before Phase 4 | After Phase 4 |
|---|---|---|
| `packages/domain` unit | 341/341 | 341/341 (unchanged) |
| `packages/infra-db` unit | 437/437 | 437/437 (unchanged) |
| `packages/infra-storage` unit | 14/14 | 14/14 (unchanged) |
| `apps/api-salesops` unit | 493/493 (per this file) → **495/495** (corrected: `98f1ef4`'s 2 new tests, not yet reconciled in this file until now) | 495/495 (unchanged by this batch) |
| `apps/api-salesops` e2e | 125/125 | 125/125 (unchanged) |
| `apps/static-store` lint | 5 warnings, 0 errors (task 1.8's recorded baseline) | 5 warnings, 0 errors — same file/line set |

Zero pre-existing test files edited anywhere outside `apps/api-public`.
`git status --porcelain` outside `templates/apps/api-public/**`,
`templates/turbo.json`, and `templates/pnpm-lock.yaml` showed nothing after
this batch's commits — confirming the "purely additive outside `api-public`"
constraint held.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 0.1a (api-public health) | `apps/api-public/src/health/health.controller.spec.ts` | Unit (Nest TestingModule) | N/A (new) | ✅ Written — failed on missing `health.controller.js` | ✅ Passed | ➖ Skipped: purely structural, single literal return, no branching | ➖ None needed |
| 0.1b (Host header proof) | manual `curl` proof, not an automated test | Manual/E2E-style proof | N/A | N/A — spike proof | ✅ Both curls pass | N/A | N/A |
| 0.2 (master independence) | `packages/infra-db/src/company/prisma-master-independence.spec.ts` | Integration (real Postgres) | ✅ 9/9 (`prisma-company.repository.spec.ts` re-run, zero edits) | N/A — proof against EXISTING production code | ✅ 2/2 Passed | ✅ 2 cases (found + null-for-unknown) | ➖ None needed |
| 0.3 (sharp toolchain) | `packages/infra-storage/scripts/sharp-smoke.mjs` | Smoke/integration (native binary) | N/A (new) | N/A — dependency-install proof | ✅ Passed | ➖ Skipped: single path, no branching | ➖ None needed |
| 0.4a/0.4b (formatMoney) | `apps/web-catalog/app/shared/lib/money.test.ts` | Unit | N/A (new) | ✅ Written — failed on missing `./money` module | ✅ Passed (5/5) | ✅ 5 cases | ➖ None needed |
| 1.1-1.2 (findBySlug) | `packages/infra-db/src/company/prisma-company.repository.spec.ts` | Integration (real Postgres) | ✅ 9/9 pre-existing, zero edits | ✅ Written — `TypeError: repository.findBySlug is not a function` | ✅ 11/11 Passed | ✅ 2 cases (resolves + null-for-unknown) | ➖ None needed |
| 1.3-1.4 (IProductImageStore) | `packages/domain/src/product/product-image-store.port.test.ts` | Unit | ✅ 333/333 pre-existing domain tests, zero edits | ✅ Written — `Cannot find module './product-image-store.port.js'` | ✅ 8/8 Passed | ✅ 8 cases (2 accept shapes, 3 extensions, 3 rejections + empty string) | ➖ None needed |
| 1.5-1.6 (search filter) | `packages/infra-db/src/product/prisma-product.repository.spec.ts` | Integration (real Postgres) | ✅ 7/7 pre-existing, zero edits | ✅ Written — wrong result set (unrelated product included, search silently ignored) | ✅ 9/9 Passed | ✅ 2 cases (name match, description match) + 1 unaffected-when-absent case | ➖ None needed |
| 1.7 (eslint boundary rules) | Manual verification — no test harness for `eslint-config` (repo convention) | Manual/smoke | ✅ 0 errors across 5 existing consumers | N/A — config-only, no test framework in this package | ✅ Both exports resolve; 0 new lint errors anywhere | N/A | ➖ None needed |
| 1.8 (wire into static-store) | Manual verification per task's own done-criteria | Manual/build-diff | ✅ Full `static-store` lint + build re-run | N/A — config-only, no test framework | ✅ Lint 0 new violations; build 188/188 files byte-identical | N/A | ➖ None needed |
| 2.1-2.2 (FsProductImageStore) | `packages/infra-storage/src/product-image/fs-product-image.store.spec.ts` | Unit (real tmpdir fs) | N/A (new package) | ✅ Written — put/open referenced a class that didn't exist | ✅ Passed | ✅ 6 cases (round trip, missing-ref null, 3 traversal rejections, wrong-MIME rejection, per-company scoping) | ➖ None needed |
| 2.3-2.4 (normalizeImage) | `packages/infra-storage/src/product-image/normalize-image.spec.ts` | Unit (real `sharp`, in-memory buffers) | ✅ 6/6 (2.1/2.2 suite re-run, zero edits) | ✅ Written — referenced a function that didn't exist | ✅ Passed | ✅ EXIF rotate+strip, always-webp, oversize downscale, non-image decode error | ➖ None needed |
| 2.5 (restart-proof) | `packages/infra-storage/src/product-image/restart-proof.spec.ts` | Integration (two real OS processes) | ✅ 13/13 (2.1-2.4 suites re-run before starting, zero edits) | ✅ Written and confirmed failing — `Cannot find module '.../restart-proof-write.js'` before the scripts existed | ✅ Passed (1/1) after creating both scripts | ➖ Skipped: single mechanism under test (cross-process persistence), no branching to triangulate — the "does NOT prove container restart" boundary is documentation, not a second code path | ➖ None needed |
| 2.6 (README scope note) | N/A — documentation only, no code, no test file | N/A | N/A | N/A | N/A | N/A | N/A |
| 3.1-3.2 (`POST /products/:id/image`) | `apps/api-salesops/src/product/product.controller.spec.ts` | Unit (Nest TestingModule + supertest, real `sharp` decode via `normalizeImage`, `PRODUCT_IMAGE_STORE` mocked) | ✅ 15/15 pre-existing (this file), 486/486 whole app, zero edits | ✅ Written and confirmed failing — 6/7 new cases 404 (route didn't exist), 1/7 vacuously 404 (unmatched route, not yet meaningful) | ✅ 22/22 Passed (15 pre-existing + 7 new) | ✅ 7 cases up front (happy path, 403, 413, 400-MIME, 404-product, hostile-filename-earns-webp, reverse-garbage-rejected-by-sharp) — spec's full scenario set covered in one RED batch | ✅ Folded `UnsupportedImageError` into the existing `withDomainErrorMapping` catch (no new helper needed); corrected `@HttpCode` 201→200 to match design.md §5 on self-review |
| 3.3 (`InfraStorageModule` wiring) | No new test file — proven by `test:e2e`'s full-`AppModule` boot | Integration (real Nest DI, real Postgres) | ✅ 125/125 pre-existing e2e, zero edits | N/A — wiring change, not new behaviour | ❌ FIRST run: all 10 e2e suites failed (`Nest can't resolve dependencies of the FsProductImageStore`) — pre-existing Phase 2 DI bug this wiring exposed. Fixed via `@Optional()` in `fs-product-image.store.ts` (not a test file). Re-run: ✅ 125/125 Passed | N/A — bugfix, not new logic to triangulate | ➖ None needed beyond the fix itself |
| 3.4 (regression) | Full `apps/api-salesops` `pnpm test` + `pnpm test:e2e` | Unit + Integration | ✅ Baseline captured BEFORE Phase 3: 486/486 unit, 125/125 e2e | N/A — regression proof, not new code | ✅ After: 493/493 unit (+7), 125/125 e2e (unchanged) | N/A | N/A |
| 4.1-4.2 (host-slug) | `apps/api-public/src/tenant/host-slug.spec.ts` | Unit (pure function) | N/A (new file) | ✅ Written — `Could not locate module ./host-slug.js` | ✅ 12/12 Passed | ✅ 12 cases (port strip, header preference, single-label, 3 reserved labels, bad chars, leading hyphen, case, both-absent) | ➖ None needed |
| 4.3-4.4 (PublicTenantGuard) | `apps/api-public/src/tenant/public-tenant.guard.spec.ts` | Unit (Nest TestingModule + supertest) | N/A (new file) | ✅ Confirmed by temporarily removing the just-written guard and re-running (`Could not locate module`), then restoring | ✅ 8/8 Passed | ✅ byte-identical-404 (3 scenarios, full HTTP response diff), no-req.user proof, no-api-common-import proof | ✅ Fixed an `import.meta.url`/CJS-compile mismatch (switched to `__dirname`) |
| 4.5-4.6 (PublicProductService) | `apps/api-public/src/product/public-product.service.spec.ts` | Unit | N/A (new file) | ✅ Written — `Could not locate module ./public-product.service.js` | ✅ 7/7 Passed | ✅ order-vs-finalPrice-disagree fixture, precio-desc mirror, 13-item page-boundary (exact 13th-ranked item on page 2), beyond-the-end empty page, unknown-category short-circuit (asserts repository never queried) | ➖ None needed |
| 4.7-4.8 (DTO + public endpoints) | `public-product.controller.spec.ts`, `public-category.controller.spec.ts`, `store.controller.spec.ts` | Unit (Nest TestingModule + supertest) | N/A (new files) | ✅ All 3 confirmed failing together — `Could not locate module` | ✅ 22/22 Passed (13+2+2 new, plus pre-existing specs untouched) | ✅ key-set equality (not `not.toHaveProperty`), non-null cost/sku/barcode fixture, exact decimal-string values, query-forwarding + defaults, 400 on bad `orden`/`porPagina`, 200 on out-of-range `pagina` | ➖ None needed |
| 4.9-4.10 (ProductImageController) | `product-image.controller.spec.ts`, `image-url.spec.ts` | Unit (Nest TestingModule + supertest) | ✅ 44/44 pre-existing api-public suite re-run before starting, zero edits | ✅ Written — `Could not locate module ./product-image.controller.js` | ✅ 16/16 Passed (8 new controller + 8 image-url, incl. approval tests for pre-existing pure functions) | ✅ full D6 branch matrix (missing, stale key, invalid ref + log spy, missing file + log spy, 304, 200 with exact headers + exact streamed bytes, explicit companyId arg) | ➖ None needed |
| 4.11 (tenant isolation e2e) | `apps/api-public/test/tenant-isolation.e2e-spec.ts` | Integration (real Postgres, real HTTP server) | ✅ 60/60 pre-existing api-public unit suite re-run before starting | N/A — proof against the already-built app, not new production code | ✅ 5/5 Passed | ✅ store/list/detail per-Host correctness, bidirectional cross-tenant 404, unknown-vs-inactive byte-identical 404, real sort query | ➖ None needed |
| 5.1-5.2 (StoreConfig + tenant/public-api clients) | `app/shared/lib/{tenant,public-api}.server.test.ts` | Unit | N/A (new files) | ✅ Written against not-yet-existing clients | ✅ Passed | ✅ Host-header slug resolution, verbatim searchParams forwarding, `X-Forwarded-Host` propagation | ➖ None needed |
| 5.3-5.4 (`/productos` route + card/grid) | `app/catalog/lib/product-query.test.ts`, `app/catalog/components/*.test.tsx` | Unit | ✅ Full suite re-run before starting, zero edits | ✅ Written — components/parser didn't exist | ✅ Passed | ✅ badge-stack combinations (Nuevo + %off + $off, each alone and all three together), empty-result state | ➖ None needed |
| 5.5 (`/productos/:id` detail route) | `app/catalog/routes/product-detail.test.tsx` | Unit | ✅ 79/79 pre-existing web-catalog suite re-run before starting | ✅ Written — route didn't exist | ✅ Passed | ✅ found-product render, unknown/inactive-id graceful degrade (no crash) | ➖ None needed |
| 6.1-6.2 (admin session) | `app/shared/lib/session.test.ts` | Unit | N/A (new file) | ✅ Written — module didn't exist | ✅ 11/11 Passed | ✅ cookie flags (httpOnly/sameSite/secure-in-prod/domain-omitted), `isTokenExpired` 5s buffer, concurrent-refresh de-dupe (two callers, one IDP fetch) | ➖ None needed |
| 6.3 (`api.server.ts`) | `app/shared/lib/api.server.test.ts` | Unit | ✅ 90/90 pre-existing re-run before starting | ✅ Written — module didn't exist | ✅ 6/6 Passed | ✅ single-401-refresh-retry, second-401-destroys-session | ✅ Bug caught by the suite itself: a reused refresh token across `it` blocks hit 6.2's module-scoped de-dupe cache and desynced a mock queue — fixed by giving every test its own token |
| 6.4 (`withAuth`, login/logout) | `auth.guards.server.test.ts`, `login.test.tsx`, `logout.test.tsx` | Unit | ✅ 96/96 pre-existing re-run before starting | ✅ Written — guard/routes didn't exist | ✅ 15/15 Passed | ✅ redirect-when-unauthenticated, real-loaderData-passthrough, login success/failure, logout clears cookie | ✅ Bug caught by `tsc`: `withAuth`'s loader param typed `unknown`, erasing the wrapped loader's return type — fixed by making it generic |
| 6.5 (`/admin/productos` CRUD) | `products.server.test.ts`, `company.server.test.ts`, `{index,nuevo,editar}.test.tsx` | Unit | ✅ 111/111 pre-existing re-run before starting | ✅ Written — clients/routes didn't exist | ✅ 17/17 Passed | ✅ cross-company 403 rejection on both update and soft-delete (`expect(result).not.toBeInstanceOf(Response)`), same-company control case, no-store-switcher-UI check | ➖ None needed |
| 6.6 (`/admin/categorias` CRUD) | `categories.server.test.ts` (extended), `{index,nuevo,editar}.test.tsx` | Unit | ✅ 126/126 pre-existing re-run before starting | ✅ Written — mirrors 6.5's not-yet-existing clients/routes | ✅ Passed (`app/admin/lib/categories.server.test.ts` +9 cases, +4 `nuevo.test.tsx`, +4 `editar.test.tsx`, +2 `index.test.tsx`) | ✅ cross-company 403 rejection (both mutations), soft-delete-never-hard assertion, same-company control case | ➖ None needed |
| 6.7 (admin image-upload UI action) | `productos/__tests__/editar.test.tsx` (extended) | Unit | ✅ full suite re-run before starting, zero edits | ✅ Written — `uploadProductImage`/upload form didn't exist | ✅ Passed (+5 cases) | ✅ successful upload, rejected upload propagates `api-salesops`'s 413/400 (never a silent no-op), failed upload leaves other fields untouched | ➖ None needed |
| 7.1-7.4 (final verification) | N/A — full-monorepo `turbo run lint typecheck test`/`test:e2e` re-run + 2 manual live smoke tests (storefront, admin), no new test files | Manual/E2E-style proof + full regression re-run | ✅ every suite's baseline reconciled (see the Phase 7 section above) | N/A — verification-only phase, no new production code | ✅ 42/42 turbo tasks, all e2e suites, both smoke tests all passed | N/A — verification phase, not new logic | ➖ None needed; 0 bugs found, 0 fix commits |

### Test Summary — Phase 3 (kept for continuity with the prior record)
- **Total tests written that batch**: 7 (all in `product.controller.spec.ts`)
- **Total tests passing that batch**: 22/22 (`product.controller.spec.ts`); 493/493 whole-app unit; 125/125 e2e
- **Pure functions created that batch**: 0
- **Production bug found and fixed that batch**: 1 (`FsProductImageStore` constructor DI resolution)

### Test Summary — Phase 4 (this batch)
- **Total tests written this batch**: 60 unit (`apps/api-public/src`) + 5 e2e (`apps/api-public/test`) = 65
- **Total tests passing this batch**: 60/60 unit, 5/5 e2e — both suites 100% green
- **Cumulative automated tests across Phase 0-4**: domain 341/341, infra-db 437/437, infra-storage 14/14, api-salesops unit 495/495 (493 previously recorded + 2 from the previously-unreconciled `98f1ef4`, see the reconciliation note above), api-salesops e2e 125/125, **api-public unit 60/60 (NEW app)**, **api-public e2e 5/5 (NEW app)**
- **Pure functions created this batch**: 5 (`resolveHostSlug`, `computeImageKey`, `assemblePublicImageUrl`, `imageKeyMatchesRef`, `parsePublicProductQuery`) plus `PublicProductService`'s internal sort comparators
- **Production bug found and fixed this batch**: 1 (test infrastructure, not app code — `import.meta.url` in `public-tenant.guard.spec.ts` broke this repo's CommonJS ts-jest compilation; fixed via `__dirname`)

## Files Changed — Phase 0

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/api-public/**` (package.json, nest-cli.json, tsconfig*.json, eslint.config.mjs, env.example, README.md, src/main.ts, src/app.module.ts, src/health/*) | Created | Bare NestJS scaffold, `GET /health` only |
| `templates/apps/web-catalog/**` (package.json, vite.config.ts, react-router.config.ts, tsconfig.json, eslint.config.mjs, vitest.config.ts, vitest.setup.ts, README.md, app/root.tsx, app/routes.ts, app/routes/home.tsx, app/vite-env.d.ts) | Created | Bare RR7 SSR scaffold, one loader echoing `Host` |
| `templates/packages/infra-db/src/company/prisma-master-independence.spec.ts` | Created | Spike 0.2 proof, additive only |
| `templates/packages/infra-storage/package.json`, `README.md`, `scripts/sharp-smoke.mjs` | Created | Spike 0.3 scaffold + proof |
| `templates/apps/web-catalog/app/shared/lib/money.test.ts` | Created | Spike 0.4a RED |
| `templates/apps/web-catalog/app/shared/lib/money.ts` | Created | Spike 0.4b GREEN |
| `templates/pnpm-lock.yaml` | Modified | New workspace packages + `sharp` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 0 checkboxes ticked |

## Files Changed — Phase 1

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/packages/domain/src/company/company-repository.port.ts` | Modified (additive) | `findBySlug(slug): Promise<Company \| null>` |
| `templates/packages/infra-db/src/company/prisma-company.repository.spec.ts` | Modified (additive) | RED tests for `findBySlug` |
| `templates/packages/infra-db/src/company/prisma-company.repository.ts` | Modified (additive) | `findBySlug` implementation |
| `templates/packages/domain/src/product/product-image-store.port.ts` | Created | `IProductImageStore`, `PRODUCT_IMAGE_STORE`, `assertProductImageRef` (D1) |
| `templates/packages/domain/src/product/product-image-store.port.test.ts` | Created | RED/GREEN tests for `assertProductImageRef` |
| `templates/packages/domain/src/product/index.ts` | Modified (additive) | barrel export for the new port |
| `templates/packages/domain/src/product/product-repository.port.ts` | Modified (additive) | `ProductListFilter.search?: string` |
| `templates/packages/infra-db/src/product/prisma-product.repository.spec.ts` | Modified (additive) | RED tests for `search` |
| `templates/packages/infra-db/src/product/prisma-product.repository.ts` | Modified (additive) | `search` -> `OR`/`contains`/`insensitive` |
| `templates/packages/eslint-config/backend-boundaries.config.js` | Modified (additive) | `frozenStorefrontBoundaryRule`, `frozenLegacyAppRule` |
| `templates/apps/static-store/eslint.config.mjs` | Modified (one line, own commit) | wired `frozenLegacyAppRule` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 1 checkboxes ticked, per work unit |

## Files Changed — Phase 2

| File | Action | What Was Done | Commit |
|------|--------|----------------|--------|
| `templates/packages/infra-storage/src/product-image/fs-product-image.store.ts` | Created | `FsProductImageStore implements IProductImageStore` (2.1-2.2) | `88c69d1` |
| `templates/packages/infra-storage/src/product-image/fs-product-image.store.spec.ts` | Created | RED/GREEN tests, incl. per-company scoping | `88c69d1` |
| `templates/packages/infra-storage/src/infra-storage.module.ts` | Created | Nest module binding `PRODUCT_IMAGE_STORE` | `88c69d1` |
| `templates/packages/infra-storage/package.json` | Modified | dropped `"type":"module"` in favour of CJS/nodenext (infra-db convention) | `88c69d1` |
| `templates/packages/infra-storage/src/product-image/normalize-image.ts` | Created | `normalizeImage` (rotate→resize→webp), the only file importing `sharp` (2.3-2.4) | `fc98d4e` |
| `templates/packages/infra-storage/src/product-image/normalize-image.spec.ts` | Created | RED/GREEN tests, incl. EXIF rotate+strip | `fc98d4e` |
| `templates/packages/infra-storage/src/index.ts` | Modified | barrel export for `FsProductImageStore` + module | `88c69d1` |
| `templates/packages/infra-storage/src/product-image/restart-proof.spec.ts` | Created | Task 2.5: two-real-process persistence proof | `544d3c4` |
| `templates/packages/infra-storage/scripts/restart-proof-write.js` | Created | Task 2.5: process 1 — writes via `FsProductImageStore.put()`, exits | `544d3c4` |
| `templates/packages/infra-storage/scripts/restart-proof-read.js` | Created | Task 2.5: process 2 — reads via `FsProductImageStore.open()` | `544d3c4` |
| `templates/packages/infra-storage/README.md` | Modified | `STORAGE_PATH`/volume requirement, 2.5 proof result + explicit proves/does-not-prove boundary, 2.6 scope note | `544d3c4` |
| `templates/.gitignore` | Modified | ignore `packages/infra-storage/.storage-restart-proof` (defense-in-depth; the spec's own hooks already clean it) | `544d3c4` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 2 checkboxes ticked (2.1-2.6), per work unit | `88c69d1`/`fc98d4e`/`544d3c4` |

## Files Changed — Phase 3

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/api-salesops/src/product/product.controller.ts` | Modified | `POST /products/:id/image` handler, `@Inject(PRODUCT_IMAGE_STORE)`, `UnsupportedImageError` folded into `withDomainErrorMapping` |
| `templates/apps/api-salesops/src/product/product.controller.spec.ts` | Modified (additive) | 7 new tests + `PRODUCT_IMAGE_STORE` provider wired into `buildApp`'s shared test harness (mechanical signature change, zero pre-existing assertions edited) |
| `templates/apps/api-salesops/src/product/product.module.ts` | Modified | `imports: [InfraDbModule, InfraStorageModule]` |
| `templates/apps/api-salesops/package.json` | Modified | `@store-mgmt/infra-storage` dependency, `@types/multer` devDependency |
| `templates/packages/infra-storage/src/index.ts` | Modified | barrel-exported `normalizeImage`/`UnsupportedImageError`/`NormalizedImage` (existed since Phase 2, not yet public) |
| `templates/packages/infra-storage/src/product-image/fs-product-image.store.ts` | Modified (bugfix) | `@Optional()` on the `basePath` constructor param — fixes the Phase-2-origin DI resolution bug this phase's wiring exposed |
| `templates/pnpm-lock.yaml` | Modified | lockfile update from the two new dependency edges above |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 3 checkboxes ticked (3.1-3.4) |
| `openspec/changes/public-catalog/apply-progress.md` | Modified | this record |

## Files Changed — Phase 4

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/api-public/src/tenant/host-slug.ts` + `.spec.ts` | Created | D2 pure parser (4.1-4.2) |
| `templates/apps/api-public/src/tenant/run-in-tenant.ts` | Created | 5-line copy of `api-common`'s helper (D3) |
| `templates/apps/api-public/src/tenant/public-tenant.guard.ts` + `.spec.ts` | Created | D2 anonymous tenant guard (4.3-4.4) |
| `templates/apps/api-public/src/tenant/public-tenant.module.ts` | Created | `@Global()` module binding `PublicTenantGuard` + `COMPANY_REPOSITORY` |
| `templates/apps/api-public/src/product/public-product.service.ts` + `.spec.ts` | Created | D5 sort-then-paginate pipeline (4.5-4.6) |
| `templates/apps/api-public/src/product/dto/{public-money,public-product,index}.ts` | Created | §3 `PublicProductDto`/`PublicMoneyDto` (4.7-4.8) |
| `templates/apps/api-public/src/product/image-url.ts` + `.spec.ts` | Created | D6 content-keyed URL assembly (4.7-4.8, 4.9-4.10) |
| `templates/apps/api-public/src/product/to-public-product-dto.ts` | Created | domain `Product` → `PublicProductDto` mapper |
| `templates/apps/api-public/src/product/parse-public-product-query.ts` | Created | §3 query-param parsing/validation |
| `templates/apps/api-public/src/product/public-product.controller.ts` + `.spec.ts` | Created | `GET /public/products`, `/public/products/:id` |
| `templates/apps/api-public/src/product/public-product.module.ts` | Created | wires product/image controllers + repositories |
| `templates/apps/api-public/src/product/product-image.controller.ts` + `.spec.ts` | Created | D6 image serving (4.9-4.10) |
| `templates/apps/api-public/src/category/dto/public-category.dto.ts` | Created | §3 category shape |
| `templates/apps/api-public/src/category/public-category.controller.ts` + `.spec.ts` | Created | `GET /public/categories` |
| `templates/apps/api-public/src/category/public-category.module.ts` | Created | wires category controller + repository |
| `templates/apps/api-public/src/store/store.controller.ts` + `.spec.ts` | Created | `GET /public/store` |
| `templates/apps/api-public/src/store/store.module.ts` | Created | wires store controller |
| `templates/apps/api-public/src/test-support/tenant-test-helpers.ts` | Created | `overridePublicTenant`/`mockTenantContextService` (mirrors `api-salesops`'s `auth-test-helpers.ts`) |
| `templates/apps/api-public/src/app.module.ts` | Modified | imports `PublicTenantModule`/`StoreModule`/`PublicCategoryModule`/`PublicProductModule` |
| `templates/apps/api-public/jest.setup.js` | Created | mirrors `api-salesops`'s test-DB env override |
| `templates/apps/api-public/package.json` | Modified | `@store-mgmt/domain`/`infra-db`/`infra-storage` deps, `supertest`/`@types/supertest`, `test:e2e` script, `setupFiles` |
| `templates/apps/api-public/env.example` | Modified | documents `DATABASE_URL`/`STORAGE_PATH`/`PUBLIC_ASSET_BASE_URL` for real dev use |
| `templates/apps/api-public/test/jest-e2e.json` | Created | mirrors `api-salesops`'s e2e jest config |
| `templates/apps/api-public/test/support/catalog-e2e-helper.ts` | Created | direct-write tenant provisioning (no auth/write endpoints to go through) |
| `templates/apps/api-public/test/tenant-isolation.e2e-spec.ts` | Created | 4.11's two-slug isolation proof |
| `templates/turbo.json` | Modified (additive) | `PUBLIC_ASSET_BASE_URL` added to `globalEnv` |
| `templates/pnpm-lock.yaml` | Modified | lockfile update from the new workspace deps above |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 4 checkboxes ticked (4.1-4.11) |
| `openspec/changes/public-catalog/apply-progress.md` | Modified | this record |

## Files Changed — Phase 5

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/web-catalog/app/shared/config/stores/{index,default.config,types}.ts` | Modified | `StoreConfig` rewritten per D9 (5.1) |
| `templates/apps/web-catalog/app/shared/lib/{public-api,tenant}.server.ts` + tests | Created | thin `api-public` client + Host-based tenant resolution (5.2) |
| `templates/apps/web-catalog/app/shared/lib/theme-css-vars.ts` + test | Created | `theme.colors` → CSS custom properties |
| `templates/apps/web-catalog/app/shared/lib/store-config.server.ts` + test | Created | loader-side `StoreConfig` resolution, 404 on unknown slug |
| `templates/apps/web-catalog/app/catalog/lib/{product-query,badges}.ts` + tests | Created | URL param parsing (5.3) + badge-stack logic |
| `templates/apps/web-catalog/app/catalog/components/{product-card,product-grid,product-badges}.tsx` + tests | Created | `/productos` grid + card rendering (5.4) |
| `templates/apps/web-catalog/app/catalog/routes/products.tsx` + test | Created | `/productos` route, verbatim URL param forwarding |
| `templates/apps/web-catalog/app/catalog/routes/product-detail.tsx` + test | Created | `/productos/:id` route, graceful 404 degrade (5.5) |
| `templates/apps/web-catalog/app/routes.ts` | Modified | registers `productos` and `productos/:id` |
| `openspec/changes/public-catalog/tasks.md` | Modified | Phase 5 checkboxes ticked (5.1-5.5) |
| `openspec/changes/public-catalog/apply-progress.md` | Modified | this record |

## Files Changed — Phase 6

| File | Action | What Was Done |
|------|--------|----------------|
| `templates/apps/web-catalog/app/shared/lib/session.server.ts` + test | Created | admin session cookie, token refresh de-dupe (D8, 6.1-6.2) |
| `templates/apps/web-catalog/app/shared/lib/api.server.ts` + test | Created | `makeAuthenticatedRequest` to `api-salesops` (D7, 6.3) |
| `templates/apps/web-catalog/app/shared/lib/auth.guards.server.ts` + test | Created | `withAuth` (D7, 6.4) |
| `templates/apps/web-catalog/app/shared/lib/session.server.ts` | Modified | `apiIdpBaseUrl` exported (was private) for `login.tsx` to reuse |
| `templates/apps/web-catalog/app/shared/routes/_auth.tsx` | Created | `/admin` layout, `withAuth`-wrapped loader |
| `templates/apps/web-catalog/app/shared/routes/login.tsx` + test | Created | `POST /auth/login` action, generic error on any failure |
| `templates/apps/web-catalog/app/shared/routes/logout.tsx` + test | Created | action-only session destroy |
| `templates/apps/web-catalog/app/admin/routes/index.tsx` | Created | placeholder `/admin` landing page (real content: 6.5-6.7) |
| `templates/apps/web-catalog/app/routes.ts` | Modified | registers `admin/login`, `admin/logout`, the `_auth` layout |
| `templates/turbo.json` | Modified (additive) | `API_IDP_URL`, `API_SALESOPS_URL` added to `globalEnv` |
| `templates/apps/api-idp/src/company/company.controller.ts` + spec | Modified | `GET /companies/:slug` (6.5's design gap) |
| `templates/apps/api-idp/src/company/dto/company-lookup-response.dto.ts` | Created | `{id, slug, name}` |
| `templates/apps/api-idp/src/company/create-company.saga.spec.ts` | Modified | pre-existing `findBySlug` mock gap fixed |
| `templates/apps/web-catalog/app/shared/lib/company.server.ts` + test | Created | `resolveCompanyId` (6.5) |
| `templates/apps/web-catalog/app/shared/lib/auth.guards.server.ts` | Modified | `withAuth` resolves and exposes `companyId` |
| `templates/apps/web-catalog/app/shared/lib/api.server.ts` | Modified | `makeAuthenticatedRequest` attaches `X-Company-Id` |
| `templates/apps/web-catalog/app/admin/lib/{products,categories}.server.ts` + tests | Created | admin CRUD clients (6.5) |
| `templates/apps/web-catalog/app/admin/lib/admin-api.types.ts` | Created | mirrors `api-salesops`'s product/category DTOs |
| `templates/apps/web-catalog/app/admin/components/product-form.tsx` | Created | shared create/edit form |
| `templates/apps/web-catalog/app/admin/routes/productos/{index,nuevo,editar}.tsx` + tests | Created | list/create/edit+soft-delete (6.5) |
| `templates/apps/web-catalog/app/routes.ts` | Modified | registers the three `productos` routes |
| every route's `meta()` export | Modified | dropped the unused `Route.MetaArgs` parameter |
| `templates/apps/web-catalog/app/admin/components/category-form.tsx` | Created | shared create/edit form for categories (6.6) |
| `templates/apps/web-catalog/app/admin/lib/categories.server.ts` | Modified | create/update/delete methods added |
| `templates/apps/web-catalog/app/admin/lib/admin-api.types.ts` | Modified | category DTOs added |
| `templates/apps/web-catalog/app/admin/routes/categorias/{index,nueva,editar}.tsx` + tests | Created | list/create/edit+soft-delete (6.6) |
| `templates/apps/web-catalog/app/admin/lib/products.server.ts` | Modified | `uploadProductImage` added (6.7) |
| `templates/apps/web-catalog/app/admin/routes/productos/editar.tsx` + test | Modified | multipart upload `Form`, `intent=upload-image` action (6.7) |
| `templates/apps/web-catalog/app/routes.ts` | Modified | registers the three `categorias` routes |
| `openspec/changes/public-catalog/tasks.md` | Modified | 6.1-6.7 checkboxes ticked |
| `openspec/changes/public-catalog/apply-progress.md` | Modified | this record |

## Files Changed — Phase 7

| File | Action | What Was Done |
|------|--------|----------------|
| `openspec/changes/public-catalog/tasks.md` | Modified | 7.1-7.4 checkboxes ticked (commit `19baa4e`) |
| `openspec/changes/public-catalog/apply-progress.md` | Modified | this record |

No production code changed in Phase 7 — 7.1's full-monorepo regression run
surfaced zero bugs, so no fix commit was required.

## Deviations from Design

Phase 0-2: None — implementation matches design.md D1-D10 for everything
touched. `InvalidProductImageRefError` (a named error class local to
`product-image-store.port.ts`, mirroring `InvalidSchemaNameError`'s pattern
in `schema-name.ts`) is an implementation detail left open by design.md,
which specifies `assertProductImageRef`'s behaviour (throw on invalid ref)
without naming the exact error class.

Phase 3 — two documented deviations, both explained in full under "Phase 3
Evidence" above:
1. `FileTypeValidator` set to `skipMagicNumbersValidation: true` — the
   installed Nest version's default behaviour (real magic-number sniffing)
   would contradict D10's "pipe is a cheap filter, sharp is the real gate"
   premise if left at the default.
2. Response status corrected from an initial 201 to `200`, matching
   design.md §5's literal `-> 200 {id, imageUrl}`; response BODY is the full
   `ProductResponseDto` (matching every other write endpoint in this
   controller) rather than a narrower `{id, imageUrl}` shape, since
   `imageUrl` assembly is explicitly owned by `apps/api-public` (not built
   until Phase 4) per design.md's own file map.

Phase 3 (found at the start of Phase 4, not introduced by it — see the
reconciliation note at the top of this file): `98f1ef4` widened D10 rather
than contradicting it — `FileTypeValidator`'s magic-number sniffing was
turned back ON (Nest 11's default), narrowing "the pipe is a cheap filter"
to "the pipe is a cheap filter that also stops obviously-hostile bytes
before they reach `sharp`/libvips", and `image/avif` was added to the
allowlist so a format `sharp` already decodes doesn't start 400ing the
moment signature detection is switched on. Not this batch's decision to
make or remake — recorded here only so the design-deviation history stays
complete.

Phase 4 — one deviation, not a silent one: design.md D5 says `nombre` sorts
"with `localeCompare` against the store's locale". `api-public` has no
access to `web-catalog`'s per-store `StoreConfig.locale` (design D9) in
this phase — that wiring is Phase 5. `PublicProductService` hardcodes
`'es'` for the `nombre` sort locale, documented in code
(`NAME_SORT_LOCALE`) and here: every route/query-param name in this app is
already Spanish-first (`/public/products?categoria=&orden=`), so this
matches the app's actual audience today; a genuinely multi-locale store is
out of this phase's scope and would need the locale threaded through from
`web-catalog` in a later phase.

## Issues Found

Phase 2 note (unchanged from the prior record): tasks 2.1-2.4 were
implemented by a prior agent that stalled before committing; the
orchestrator reviewed the diff, confirmed the test suite was green, and
committed the work (`88c69d1`, `fc98d4e`) without rewriting it.

Phase 3 — one production bug found and fixed (not blocking, not a
pre-existing test failure): `FsProductImageStore`'s constructor
(`packages/infra-storage`) could not be resolved by NestJS's real DI
container — a latent Phase 2 defect, first exposed by this phase's
`InfraStorageModule` wiring (Phase 2's own tests always used direct
`new FsProductImageStore(...)` construction, never Nest DI). See "Phase 3
Evidence" §3.3 for the full root-cause and fix. Fixed via `@Optional()`
(mirrors an identical, already-documented precedent in
`packages/infra-db/src/tenant/tenant-prisma-factory.ts`) — a production-code
fix in a non-frozen package, zero test files touched, e2e suite re-verified
green (125/125) after the fix.

Phase 4 — one issue found and fixed, in TEST infrastructure only (never
shipped to `dist/`, no app-code behavior affected): `public-tenant.guard.spec.ts`
initially used `import.meta.url` to resolve its own source file's path for a
static-import-scan assertion. This repo's ts-jest setup compiles to
CommonJS; a single file using `import.meta` forces TypeScript to emit ESM
output for just that file, which Jest then fails to load
(`ReferenceError: exports is not defined`) because nothing else in the
transform pipeline expects ESM output. Fixed by switching to
`__dirname`/`node:path`, the pattern every other spec file in this repo
already uses — no precedent anywhere in the codebase for `import.meta.url`
inside a Jest-run `.ts` file. Also found and reconciled (not fixed, since
nothing was broken): two commits landed on `public-catalog` after Batch 4's
apply-progress was last saved (`48f95f4`, `98f1ef4`) that this file never
recorded — see the reconciliation note at the top of this file.

## Commits (45 total, Phase 0 through Phase 7, in order — this file's own documentation-sync commit is the 46th, made during `sdd-verify`)

Phase 0 (7):
1. `65a1604` feat(public-catalog): scaffold bare api-public and web-catalog, prove wildcard-subdomain Host header (0.1a+0.1b)
2. `99abe8e` test(public-catalog): prove PrismaMasterService is schema-independent (0.2)
3. `b597ba5` feat(public-catalog): prove sharp installs and runs in this workspace (0.3)
4. `af95bfe` chore(public-catalog): tick tasks.md for spikes 0.1a, 0.1b, 0.2, 0.3 (reconciliation)
5. `ed7c1c3` test(public-catalog): RED — money.test.ts (0.4a)
6. `2db649b` feat(public-catalog): GREEN — formatMoney with an explicit MN branch (0.4b)
7. `e21f11d` docs(public-catalog): record Phase 0 apply-progress

Phase 1 (5):
8. `77e8eb0` feat(public-catalog): add ICompanyRepository.findBySlug (1.1-1.2)
9. `b6fafe5` feat(public-catalog): add IProductImageStore port (1.3-1.4)
10. `f6e531e` feat(public-catalog): add case-insensitive search to ProductListFilter (1.5-1.6)
11. `96e450d` feat(public-catalog): add frozen-boundary eslint rules (1.7)
12. `c3f7397` chore(static-store): wire frozenLegacyAppRule into lint config (1.8)
13. `104419b` docs(public-catalog): record Phase 1 apply-progress

Phase 2 (4):
14. `88c69d1` feat(public-catalog): add FsProductImageStore adapter (2.1-2.2)
15. `fc98d4e` feat(public-catalog): normalize uploaded images to upright webp (2.3-2.4)
16. `544d3c4` test(public-catalog): prove product images survive a process restart (2.5-2.6)
17. `5ac2472` docs(public-catalog): record Phase 2 apply-progress

(Task-numbered plan called for 5 commits for Phase 1, landed exactly as 5 —
now 6 with the apply-progress doc commit. Phase 2's plan called for 3
work-unit commits (2.1-2.2, 2.3-2.4, 2.5-2.6); landed as 3 work-unit commits
plus a 4th trailing docs commit, same pattern as Phase 0/1 — `5ac2472` was
not yet in `git log` when this file's Phase 2 entry was last saved to
Engram; corrected here while verifying Phase 3's own commit landed cleanly,
not re-litigating Phase 2's scope.)

Phase 3 (1, per tasks.md's explicit "1 commit" done-criterion):
18. `c7e2de9` feat(public-catalog): add authenticated product image
    upload to api-salesops (3.1-3.4) — includes the `FsProductImageStore`
    DI fix and the tasks.md/apply-progress.md updates in the same commit,
    matching the task's own 1-commit budget.

Reconciliation + a real Phase-3-scope security fix, found at the start of
this batch, not made by it (see the reconciliation note at the top of this
file):
19. `48f95f4` docs(public-catalog): reconcile apply-progress commit list
    (reconciliation) — corrected Phase 2's commit count 17→18 for the
    `5ac2472` docs commit.
20. `98f1ef4` fix(public-catalog): inspect image magic numbers instead of
    trusting Content-Type — re-enables `FileTypeValidator`'s magic-number
    sniffing on the `api-salesops` upload pipe, adds `image/avif` to the
    allowlist, adds 2 tests. Widens D10, does not contradict it (see
    "Deviations from Design" above).

Phase 4 (7, matching tasks.md's explicit "7 commits total for Phase 4"):
21. `cd88a0b` feat(public-catalog): add host-slug parser for public tenant
    resolution (4.1-4.2)
22. `5f606b7` feat(public-catalog): add PublicTenantGuard for anonymous
    tenant resolution (4.3-4.4)
23. `1e0ebab` feat(public-catalog): add PublicProductService
    sort-then-paginate pipeline (4.5-4.6)
24. `1f05e2b` feat(public-catalog): add public product/category/store
    endpoints and DTO contract (4.7-4.8)
25. `3542394` feat(public-catalog): serve public product images with the
    D6 404/cache matrix (4.9-4.10)
26. `955ddfd` test(public-catalog): prove tenant isolation e2e against one
    running api-public instance (4.11)
27. `bf6507b` docs(public-catalog): record Phase 4 apply-progress and
    reconcile Phase 3's commit list

Phase 5 (3 code commits already on the branch when this batch started,
never before recorded here — reconciled now; +1 this batch):
28. `b5c51ed` feat(web-catalog): resolve tenant StoreConfig from the Host
    header (D9) (5.1-5.2)
29. `2c6fc47` feat(web-catalog): add the /productos catalog page (5.3-5.4)
30. `7ea5b90` feat(web-catalog): add the /productos/:id product-detail
    route (5.5)
31. `43b1c5a` docs(public-catalog): record Phase 5 apply-progress and
    reconcile its commit list

Phase 6 (7 work units, 6.1-6.7):
32. `75e2672` feat(web-catalog): add the admin session cookie (6.1-6.2)
33. `53cf098` docs(public-catalog): record Phase 6 apply-progress
    (partial — 6.1-6.2 only)
34. `3304cb4` feat(web-catalog): add makeAuthenticatedRequest to
    api-salesops (6.3)
35. `c76da78` docs(public-catalog): record Phase 6 apply-progress
    (partial — 6.1-6.3)
36. `ad491ae` docs(public-catalog): correct 6.3's api-idp
    integration-check record — it was actually run and passes
37. `b065483` feat(web-catalog): add withAuth, login/logout routes,
    /admin layout (6.4)
38. `a5d91c9` docs(public-catalog): record Phase 6 apply-progress
    (partial — 6.1-6.4), including 6.4's live manual smoke test
39. `5c12a7e` feat(api-idp): add GET /companies/:slug for admin
    companyId resolution (6.5's design gap)
40. `540d224` feat(web-catalog): add /admin/productos CRUD with
    cross-company rejection (6.5)
41. `474a7c9` feat(web-catalog): add /admin/categorias CRUD with
    cross-company rejection (6.6)
42. `9782b27` docs(public-catalog): check off task 6.6 in the tasks
    artifact
43. `dad4e27` feat(web-catalog): add admin product image-upload action
    (6.7)
44. `7c80c10` docs(public-catalog): check off task 6.7 (image-upload UI)

Phase 7 (1 commit, docs-only — 7.1 surfaced zero bugs):
45. `19baa4e` docs(public-catalog): check off Phase 7 final verification
    (7.1-7.4)

(This file's own commit adding the present section — recording 6.6, 6.7,
and Phase 7 that were real, landed, and complete but never written into
this document — is the next commit after `19baa4e`, made during the first
`sdd-verify` pass, 2026-08-13.)

## Remaining Tasks

None. Phase 0 through Phase 7 are ALL COMPLETE (53/53 tasks). Ready for
`sdd-archive`.

## Status

Phase 0-3: 24/24 work units complete (carried forward from the prior
batch's own count, plus the two Phase-3-scope commits `48f95f4`/`98f1ef4`
found and reconciled at the start of this batch — see the reconciliation
note at the top of this file).

Phase 4: 11/11 tasks complete (4.1-4.11), 6 code/test commits + trailing
docs commit `bf6507b` = 7, matching tasks.md's explicit "7 commits total
for Phase 4" done-criterion. `apps/api-public` unit suite: 0→60 tests (new
app, 9 suites). `apps/api-public` e2e suite: 0→5 tests (new app, 1 suite),
running against real Postgres after building `domain`/`infra-db`/
`infra-storage` to `dist/` first. Every pre-existing suite outside
`apps/api-public` re-verified byte-identical to its last-recorded baseline:
`domain` 341/341, `infra-db` 437/437, `infra-storage` 14/14, `api-salesops`
unit 495/495 (493 previously recorded + 2 from `98f1ef4`, now reconciled),
`api-salesops` e2e 125/125, `static-store` lint 5 warnings/0 errors (same
file/line set as task 1.8's recorded baseline). Lint
(`--max-warnings 0`) and `tsc --noEmit` clean on `apps/api-public`. Zero
edits to any pre-existing test file anywhere outside `apps/api-public`.

Phase 5: 5/5 tasks complete (5.1-5.5), 3 code/test commits + trailing docs
commit `43b1c5a` = 4, matching tasks.md's explicit "4 commits total for
Phase 5" done-criterion. `apps/web-catalog` full suite: 0→79 tests (14
suites, grown across the phase). `tsc --noEmit` clean. Lint: 3 warnings
(`_args`, pre-existing pattern shared with `products.tsx`/`home.tsx`), 0
errors, within the `--max-warnings 5` budget.

Phase 6: 3/6 work units complete (6.1-6.2, 6.3, 6.4). `apps/web-catalog`
full suite: 79→111 tests (+11 `session.test.ts`, +6 `api.server.test.ts`,
+4 `auth.guards.server.test.ts`, +5 `login.test.tsx`, +2
`logout.test.tsx`). `tsc --noEmit` clean. Lint: still 3 warnings, 0
errors. Zero edits to any pre-existing test file. `SESSION_SECRET` was
already in `turbo.json`'s `globalEnv`; `API_IDP_URL` and
`API_SALESOPS_URL` added across 6.2-6.3. 6.3's "manual/integration check
against api-idp login round-trip" done-criterion is MET — Postgres is
reachable in this environment via the Docker bridge gateway
(`172.17.0.1:5432`, not `localhost`); `api-idp` was booted for real
against it and `session.server.ts`'s actual functions were run via `tsx`
against a real `/auth/login` + `/auth/refresh` round-trip with the seeded
`owner` account. 6.4 went further: both `api-idp` AND `web-catalog`'s own
dev server were booted for real, and the full login → guarded `/admin` →
logout → re-guarded HTTP flow was driven with `curl` against a real
`Host: default.localhost:3010`, confirming `withAuth`,
`_auth.tsx`, `login.tsx`, and `logout.tsx` all work together, not just in
isolation (see 6.3's and 6.4's evidence above for full detail, including
a correction to this batch's own earlier "nothing left running" claim —
an orphaned `api-idp` process from 6.3's check was still running,
undiscovered until 6.4's check hit `EADDRINUSE`; fixed by verifying
process death with `pgrep` + a port check, not a `kill` exit code alone).

Phase 6: 4/6 work units complete (6.1-6.2, 6.3, 6.4, 6.5). `apps/web-catalog`
full suite: 111→126 tests (+2 `company.server.test.ts`, +1
`api.server.test.ts` extended, +2 `auth.guards.server.test.ts` extended,
+6 `products.server.test.ts`, +1 `categories.server.test.ts`, +4
`nuevo.test.tsx`, +4 `editar.test.tsx`, +2 `index.test.tsx`). `tsc
--noEmit` clean on both `apps/web-catalog` and `apps/api-idp`. Lint: 0
warnings, 0 errors on both (web-catalog's `_args` pattern removed
app-wide; api-idp already ran at `--max-warnings 0`). `apps/api-idp`
unit suite: 71/71 (7 new for `GET /companies/:slug`, 1 pre-existing gap
fixed). 6.5 required resolving a real design gap first (`X-Company-Id`
had no resolution path anywhere in the codebase) — presented to the
owner as a choice, owner picked `GET /companies/:slug`; see 6.5's
evidence above for the full investigation and resolution. Verified with
a live create→edit→soft-delete cycle against the real tenant database
(api-idp + api-salesops + web-catalog all booted for real), not just
mocked unit tests — see 6.5's evidence above. All three dev servers and
the test product row cleaned up afterward.

Phase 6: 7/7 work units COMPLETE (6.1-6.7). `apps/web-catalog` full suite:
126→146 tests (6.6 added category CRUD following the exact same
cross-company-rejection discipline as 6.5's product CRUD; 6.7 wired the
already-built `POST /products/:id/image` endpoint (task 3.2) into the
admin edit route as a second `intent`-distinguished action on the same
form). `tsc --noEmit` clean. Lint: 0 errors, within budget. 2 commits
(`474a7c9` category CRUD, `dad4e27` image-upload action).

Phase 7: 4/4 tasks COMPLETE (7.1-7.4). Full monorepo lint/typecheck/test/
e2e re-run clean (42/42 turbo tasks, zero regressions against every
phase's own recorded baseline), diff-audit confirmed frozen
packages/apps untouched beyond the one authorised `static-store` line,
two live end-to-end smoke tests (public storefront, admin) both passed
against a real dev Postgres — including 6.7's image upload surviving a
fresh page load, confirmed via direct SQL and an on-disk file check. 1
commit (`19baa4e`, docs-only — 7.1 found zero bugs to fix). Full detail:
see the "Completed Tasks (Phase 7)" section above and engram
`sdd/public-catalog/apply-progress` (#2147).

**THE ENTIRE public-catalog CHANGE (PHASE 0 THROUGH PHASE 7) IS
IMPLEMENTATION-COMPLETE.** First formal `sdd-verify` pass ran 2026-08-13:
0 CRITICAL, 2 WARNING (both about this file's own staleness relative to
the real implementation — closed by this documentation-sync commit), 2
SUGGESTION (informational, no action needed). Ready for `sdd-archive`.
