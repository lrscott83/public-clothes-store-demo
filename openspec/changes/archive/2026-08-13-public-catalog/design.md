# Design: public-catalog

Two new deployables and one new package. `api-public` reads the tenant DB directly and answers
anonymously; `web-catalog` renders the storefront server-side and hosts `/admin`;
`packages/infra-storage` puts product image bytes on disk behind a port the domain owns. One process
serves every tenant; the tenant is the first label of the request Host.

Inputs: [`proposal.md`](./proposal.md) · [`explore.md`](./explore.md) ·
[`docs/system/architecture.md`](../../../docs/system/architecture.md). Reference (READ-ONLY):
`poolops-biz`. Every `file:line` below was read, not recalled.

## 1. The shape

```
Host: default.localhost:3000
        │
        ▼
web-catalog (RR7 SSR)  ──public loaders──▶  api-public   ──▶ infra-db ──▶ tenant schema
   │  admin loaders/actions                      │
   │                                             └──▶ infra-storage (read bytes)
   ├──▶ api-idp        (login / refresh)
   └──▶ api-salesops   (CRUD + image upload) ──▶ infra-storage (write bytes)
```

The browser never calls an API. Every backend call is server-to-server from a loader or action, which
is why CORS stays out of scope and why the access token can live in an `httpOnly` cookie the client
JS cannot read.

`api-public` depends on `@store-mgmt/domain`, `@store-mgmt/infra-db`, `@store-mgmt/infra-storage`.
**Not** on `@store-mgmt/api-common` — see D3.

## 2. Architecture decisions

### D1 — The storage port is `IProductImageStore`, in the domain's vocabulary. Not poolops's.

poolops's `IStorageService` (`packages/domain/src/services/storage.interface.ts`) declares **one**
method, `generateDocumentFileName`. The methods that matter — `saveFile`, `getFullPath`,
`fileExists`, `ensureDir` — exist only on the concrete `StorageService`
(`packages/api-common/src/storage/storage.service.ts:51-115`), so every consumer injects the class.
The port is decoration; the dependency arrow still points at the adapter.

| Option | Verdict |
|---|---|
| Mirror poolops: near-empty port, real API on the adapter | **Rejected.** It fails architecture.md's north star outright — consumers would bind `FsProductImageStore`, and `api-public` would compile against a filesystem class. |
| Port mirrors the filesystem (`ensureDir`/`saveFile`/`getFullPath`/`fileExists`) | **Rejected.** Leaks POSIX into the domain. A future S3 adapter cannot implement `getFullPath` honestly and `ensureDir` is meaningless there — the port would be an obstacle at the first swap. |
| **Port states the intent: put product image bytes, open product image bytes** | **Chosen.** Two methods, no paths, no directories. Both apps inject `PRODUCT_IMAGE_STORE`. |

```ts
// packages/domain/src/product/product-image-store.port.ts
export type ProductImageRef = string;              // e.g. 'products/<uuid>.webp' — opaque to the domain

export interface PutProductImageInput {
  readonly companyId: string;
  readonly bytes: Uint8Array;                      // not Buffer: the domain stays runtime-agnostic
  readonly declaredMimeType: string;               // validated at delivery; the adapter re-checks
}

export interface ProductImageContent {
  readonly stream: AsyncIterable<Uint8Array>;      // streamed, never buffered — see D6
  readonly contentType: string;
  readonly byteLength: number;
}

export interface IProductImageStore {
  put(input: PutProductImageInput): Promise<ProductImageRef>;
  /** `null` when the ref resolves to nothing. A missing file is an ANSWER here, not a throw. */
  open(companyId: string, ref: ProductImageRef): Promise<ProductImageContent | null>;
}

export const PRODUCT_IMAGE_STORE = Symbol('IProductImageStore');
```

`companyId` is an explicit argument on both methods, never read from `AsyncLocalStorage`. The adapter
always resolves under `<base>/<companyId>/`, so a ref belonging to tenant A cannot be opened through
tenant B's request even if it is guessed. Tenancy is in the signature, not in ambient state.

The ref grammar is a pure domain function, `assertProductImageRef(ref)` — same file — so the writer
and the reader agree by construction and it is unit-testable with no filesystem:
`^[a-z0-9][a-z0-9/_-]*\.(webp|jpe?g|png)$`, plus explicit rejection of `..`, a leading `/`, and `\`.
Deliberately permissive enough to cover the seeded rows (`products/cafeteras/cafeteras1.jpeg`,
`salesops-mvp/app/data/catalog.json:55`) without a migration.

### D2 — The public guard resolves the tenant and does NOT open the ALS scope.

```
X-Forwarded-Host ?? Host        → strip port, lowercase
  → labels = split('.')         → labels.length < 2                → 404
  → slug = labels[0]            → reserved ('www','api','admin')   → 404, no DB hit
                                → !/^[a-z0-9][a-z0-9-]{0,62}$/     → 404, no DB hit
  → ICompanyRepository.findBySlug(slug)
  → !company || !isActive || !schemaName                           → 404, identical body
  → req.tenant = { companyId, schemaName }
```

The guard never calls `tenantContext.run(...)`. `TenantContextGuard`'s scope dies when `canActivate`
resolves — that is the whole reason `createRunInTenant` exists
(`packages/api-common/src/auth/run-in-tenant.ts:27-31`), and the same physics apply here. Every
`api-public` handler re-opens its own scope from `req.tenant`. **The guard needs no scope of its
own**: its only query is the master `Company` lookup, and `PrismaCompanyRepository` binds
`PrismaMasterService` (`prisma-company.repository.ts:68`), which is schema-independent. Forgetting the
re-scope in a handler fails loudly with `TenantContextNotActiveError` — never a silent cross-tenant
read.

Rejected: doing the resolution in a NestJS middleware wrapping `next()` inside `run()`. It would
survive into the handler, but it would also make `api-public` the only app in the repo where tenant
scoping works differently from `api-salesops`. One discipline, everywhere.

### D3 — `api-public` copies `runInTenant` instead of depending on `api-common`.

`api-common` is untouched by this change, but *usable* and *appropriate* are different questions.
Depending on it drags `passport`, `@nestjs/passport`, `bcrypt` and the JWT strategy into an app whose
defining property is that nobody authenticates. `api-public/src/tenant/run-in-tenant.ts` is a
five-line copy with a comment naming its twin. Dependency hygiene beats DRY at this size.

### D4 — Unknown slug and inactive company are the same 404, byte for byte.

Not just the same status: the same body and the same headers. A spec test asserts the two responses
are identical, because "same status, different message" is the exact shape that turns a 404 into a
store-enumeration oracle.

### D5 — Sort by `finalPrice` happens after the DB, before pagination.

```
SQL      active:true  +  categoryId  +  ILIKE(name) OR ILIKE(description)      ← PrismaProductRepository
  ↓ Product[]  (Money as bigint minor units)
domain   finalPrice(p)  per row                                                ← pricing.ts:85-92, pure
  ↓
memory   sort  →  slice(offset, offset + pageSize)  →  map to PublicProductDto ← api-public
```

`finalPrice` is derived and never stored (`product.ts:10-13`). Reimplementing
`max(0, price - round_half_up(price*pct/10000) - discount)` in SQL forks the single source of truth
the moment anyone touches the rounding. So the whole filtered set is materialized, sorted, then paged.
Bounded by one tenant's catalog; the tripwire is a `WARN` when a single query materializes more than
2000 rows.

`nombre` sorts with `localeCompare` against the store's `locale`, which is also why it is not pushed
into SQL — Postgres collation and JS collation disagree on Spanish accents, and the UI must match what
the shopper sees.

Cross-package consequence, stated not slipped: `ProductListFilter` gains an optional
`search?: string` (`packages/domain/src/product/product-repository.port.ts:4-8`) and
`PrismaProductRepository.list` implements it (`prisma-product.repository.ts:146-155`). Additive; the
existing two-filter behaviour is unchanged when `search` is absent. **Rejected:** having `api-public`
call `TenantContextService.getClient()` and write its own Prisma query — architecture.md's decision
table puts repository implementations in `infra-db`, and an app owning a query is exactly the drift
that table exists to prevent.

### D6 — Public images: immutable URLs keyed by a content-derived cache key.

`GET /public/products/:productId/image/:imageKey`

`imageKey` is `sha1(product.image).slice(0,16)` plus the ref's extension — **a cache key, not a
security boundary**. It is stable while the image is, changes the instant a re-upload mints a new
UUID, and never leaks the storage layout.

Why the key is in the path at all: a bare `/image` URL with `Cache-Control: immutable` is a lie — the
owner re-uploads and shoppers keep the old photo for a year. Rejected `?v=<key>`: some CDNs drop query
strings from the cache key by default.

| Condition | Response |
|---|---|
| Product absent, or `active === false` | `404` |
| `imageKey` does not match the current ref | `404` (a stale URL; the page re-renders with the new one) |
| Ref fails `assertProductImageRef` | `404` + `PRODUCT_IMAGE_REF_INVALID` log. Never `400` — echoing "malformed path" to an anonymous caller is a traversal oracle. |
| `open()` returns `null` (row exists, file gone) | `404` + `PRODUCT_IMAGE_MISSING` error log with companyId/productId/ref. Never `500` (the request is well-formed, retrying will not help) and never a placeholder image (that makes volume data loss invisible). |
| `If-None-Match` matches | `304`, empty body, same `Cache-Control` |
| Otherwise | `200` |

`200` headers: `Content-Type` from the ref extension · `Content-Length` · `ETag: "<imageKey>"` ·
`Cache-Control: public, max-age=31536000, immutable`. No `Vary`, no cookie, no `Set-Cookie`.

poolops sends `private, max-age=3600` and `res.send(buffer)`
(`service-location.controller.ts:598-607`). Both are wrong here: its photos are private tenant
documents, ours are public marketing assets meant to sit behind a CDN; and buffering a 10 MB file per
concurrent request on the highest-fanout endpoint in the app is a memory multiplier. We stream.

Accepted consequence, written down: deactivating a product removes it from the catalog immediately
(listings are never cached) but an already-fetched image may stay in one shopper's browser cache for
up to a year. A product photo is not a secret, and it is not discoverable — reaching the URL requires
the product id, which only the listing hands out, and the listing filters inactive.

### D7 — `web-catalog` does not gate by role. `api-salesops` does.

poolops's `withRoles` is a stub (`auth.guards.server.ts:286-306`). Ours is not written at all. Roles
in this repo are resolved server-side per request by `TenantContextGuard` from an ACTIVE `Membership`
plus the tenant `CompanyUser` row; the browser tier has no authoritative copy. `withAuth` guarantees a
session, and a `403` from `api-salesops` renders as a "no permission" page. A second source of truth
for authorization would drift, and the one that drifts is always the permissive one.

### D8 — The session cookie is host-only. Deliberately.

```
name: '__store_session'   httpOnly: true   sameSite: 'lax'   path: '/'
secure: NODE_ENV === 'production'          maxAge: 7d        secrets: [SESSION_SECRET]  // boot fails if unset
domain: undefined         // ← LOAD-BEARING
```

Setting `domain: '.example.com'` would share one session across every tenant subdomain — an owner
logged into store A would arrive at store B's `/admin` already authenticated. poolops has one host and
never faced this. `SessionData` is `{ accessToken, refreshToken, userId }`: **no `activeCompanyId`**,
because the subdomain fixes the store and a switcher would contradict it.

Ported verbatim in intent: `isTokenExpired` (local JWT `exp` decode, no HTTP) and the `Map`-keyed-by-
old-refresh-token de-dupe cache with 30 s eviction (`session.server.ts:136-215`) — it fixes a real
React Router 7 parallel-loader race, not a hypothetical one. `returnTo` is stored as a **path**, not a
full URL; poolops needs origin allow-listing because it redirects across four apps, we do not.

`withPublicRedirect` and `withOptionalAuth` are **not** ported: no public route here redirects an
authenticated visitor, and the catalog never varies by user. Porting stubs is cargo cult.

### D9 — Per-slug config is a static map, and it is a rewrite, not a copy.

`app/shared/config/stores/index.ts` holds `Record<string, StoreConfig>` built from static imports. A
dynamic `import(\`./${slug}.config\`)` is rejected twice over: Vite cannot see the modules at build
time, and an attacker-influenced module path is a hazard.

`StoreConfig` is rewritten in `web-catalog` (`packages/storefront` is FROZEN and must never be
imported). Kept: `slug`, `brand`, `locale`, `theme.colors`, `logo`, `hero`, `nav`, `productsPage`,
`footer`. Dropped, with reasons: `catalog{categories,products}` — the DB owns it now, which is the
entire point of this change; `currency` — per product, and the proposal refuses a one-currency-per-
store assumption; `vertical`, `homeSections`, `features` — not needed by the products slice.

Unknown slug → `404` from the loader, mirroring `api-public`. Two independent 404 paths for one
condition; both get a test.

### D10 — Upload validation: the pipe is a filter, `sharp` is the gate.

`FileTypeValidator` inspects the client-supplied `Content-Type` header. Describing it as the security
boundary — as the poolops copy invites — is wrong. It is a cheap first filter; the real gate is
`sharp` failing to decode a non-image, which maps to `400 Unsupported image`. The extension is derived
from the normalization **output**, never from the client filename.

Normalization output is always WebP: `.rotate()` (honour EXIF) → `.resize({ width: 1600,
withoutEnlargement: true })` → `.webp({ quality: 82 })`. One output format means one extension, one
`Content-Type` and one branch in the public GET. Rejected "keep the input format": heic/heif is not
browser-servable and must convert anyway, so the passthrough branch never covers all inputs — it just
adds two more.

The previous file is **not** deleted on re-upload: an in-flight CDN or browser fetch of the old URL
still resolves. Orphan cleanup is a sweeper's job and there is precedent
(`infra-db/src/tenant/tenant-orphan-sweep.ts`). Recorded as known debt.

## 3. The public HTTP contract

`web-catalog` depends on these shapes; `api-public` owns them.

| Method | Path | Notes |
|---|---|---|
| `GET` | `/public/store` | `{ name, slug }` — lets a loader fail fast before rendering |
| `GET` | `/public/categories` | active only: `{ id, slug, name, image, order }[]` |
| `GET` | `/public/products` | paginated envelope, below |
| `GET` | `/public/products/:id` | one **active** product; inactive → `404` |
| `GET` | `/public/products/:id/image/:imageKey` | D6 |
| `GET` | `/health` | no tenant resolution |

Query parameters use the same Spanish names as `web-catalog`'s user-facing URL
(`/productos?categoria=&q=&orden=&pagina=`), so the loader forwards `url.searchParams` verbatim and
there is no translation table to drift.

| Param | Values | Default | Bad input |
|---|---|---|---|
| `q` | trimmed, ≤ 100 chars | — | truncated, never rejected |
| `categoria` | category **slug** (`ICategoryRepository.findBySlug` exists already) | — | unknown slug → empty page, not `404` |
| `orden` | `destacado \| precio-asc \| precio-desc \| nombre` | `destacado` | `400` — it is our own URL; a typo is a bug |
| `pagina` | integer ≥ 1 | `1` | beyond the end → empty `items`, `total` still exact |
| `porPagina` | `12 \| 24 \| 48` | `12` | `400` |

```jsonc
{ "items": [ /* PublicProductDto */ ], "page": 1, "pageSize": 12, "total": 87, "pageCount": 8 }
```

`PublicProductDto` — every field's wire type, stated so nobody writing a test has to guess:

| Field | Wire type | Example | Note |
|---|---|---|---|
| `id` | `string` | `"9f3a…"` | uuid |
| `name` | `string` | `"Cafetera Express"` | |
| `description` | `string` | `"…"` | the card renders it |
| `categoryId` | `string` | `"c1b2…"` | uuid |
| `categorySlug` | `string` | `"cafeteras"` | what `?categoria=` takes |
| `price` | `{ amount: string; currency: string }` | `{"amount":"199.99","currency":"USD"}` | `PublicMoneyDto` |
| `finalPrice` | `{ amount: string; currency: string }` | `{"amount":"179.99","currency":"USD"}` | derived; currency is `price`'s |
| `percentDiscountPrice` | **`string`** (decimal) | `"20.00"` | scale-2, **never a JSON number** |
| `discountPrice` | **`string`** (decimal) | `"5.00"` | scale-2, no currency, **never a JSON number** |
| `isOffer` | `boolean` | `true` | |
| `isNew` | `boolean` | `false` | |
| `imageUrl` | `string` | `"/public/products/9f3a…/image/3c1d9b0e77a2f5b1.webp"` | assembled by `api-public` |
| `order` | `number` | `10` | the only JSON number in the DTO |

The two discount fields and both money `amount`s are **decimal strings on the wire, never JSON
numbers**. This is not a new rule — the repo already decided it and wrote down why:
`apps/api-salesops/src/product/dto/money-amount.dto.ts:2-4` — *"`amount` is a decimal string (never a
JSON number, decimal fidelity preserved end-to-end)"* — and `ProductResponseDto` declares
`percentDiscountPrice!: string` / `discountPrice!: string` (`product-response.dto.ts:18-19`). The
domain stores both as scaled `bigint`s (`pricing.ts:8-15`); a JSON number is the exact step where
that fidelity is lost, which is why the boundary types are strings on both sides of the repo.

Absent **by construction**, not by deletion in a mapper: `cost` (and therefore its currency — it is a
`MoneyAmountDto`, there is no top-level `costCurrency`), `sku`, `barcode`, `active`, `createdAt`,
`updatedAt`. The contract test asserts the response key set equals the allow-list — a key-set
assertion cannot drift the way an omitting mapper can — **and** asserts the value type of every
field, because a correct key set with a JSON number in `discountPrice` is still a broken contract.

`imageUrl` is assembled by `api-public` (`src/product/image-url.ts`, one place, prefixable with
`PUBLIC_ASSET_BASE_URL` when a CDN lands). `web-catalog` never builds an image path and never sees the
storage ref.

## 4. File map

| Path | Action | What |
|---|---|---|
| `packages/domain/src/product/product-image-store.port.ts` | Create | D1 port, `PRODUCT_IMAGE_STORE`, `assertProductImageRef` |
| `packages/domain/src/product/product-repository.port.ts` | **Modify (additive)** | `ProductListFilter.search?: string` |
| `packages/domain/src/company/company-repository.port.ts` | **Modify (additive)** | `findBySlug(slug): Promise<Company \| null>` |
| `packages/infra-db/src/company/prisma-company.repository.ts` | **Modify (additive)** | `findBySlug` — `slug` is already `@unique`, no migration |
| `packages/infra-db/src/product/prisma-product.repository.ts` | **Modify (additive)** | `search` → `OR: [name, description]` `contains` + `mode: 'insensitive'` |
| `packages/infra-storage/src/infra-storage.module.ts` | Create | binds `PRODUCT_IMAGE_STORE` → `FsProductImageStore` |
| `packages/infra-storage/src/product-image/fs-product-image.store.ts` | Create | adapter: `STORAGE_PATH` + `<companyId>/` + validated ref |
| `packages/infra-storage/src/product-image/normalize-image.ts` | Create | `sharp` — the only file that imports it |
| `apps/api-public/src/tenant/{host-slug.ts,public-tenant.guard.ts,run-in-tenant.ts}` | Create | D2, D3. `host-slug.ts` is pure and Nest-free |
| `apps/api-public/src/product/{public-product.controller,public-product.service,product-image.controller,image-url}.ts` | Create | D5, D6 |
| `apps/api-public/src/product/dto/*.ts` | Create | §3 shapes |
| `apps/api-public/src/{category,store,health}/` | Create | §3 |
| `apps/web-catalog/app/shared/lib/{session,api,public-api,auth.guards,store-config,tenant}.server.ts` | Create | D7, D8 |
| `apps/web-catalog/app/shared/lib/money.ts` | Create | explicit `MN` branch |
| `apps/web-catalog/app/shared/config/stores/{index,default.config}.ts` | Create | D9 |
| `apps/web-catalog/app/{catalog,admin}/{routes,components,lib}/` | Create | feature folders, `web-manager` convention |
| `apps/api-salesops/src/product/product.controller.ts` | **Modify (additive)** | `POST /products/:id/image`, `@Roles(owner, admin)`, same guard chain, same `runInTenant` |
| `apps/api-salesops/src/product/product.module.ts` | **Modify** | import `InfraStorageModule` |
| `packages/eslint-config/backend-boundaries.config.js` | **Modify (additive)** | §6 rules |
| `packages/api-common/**` | **Untouched** | so `api-idp` gains nothing transitively |

`web-catalog/app/routes.ts` mirrors `web-manager`'s single array: public routes as siblings,
`layout('shared/routes/_auth.tsx', [...])` around `/admin`. `admin/login` and `admin/logout` sit
**outside** that layout — poolops puts login in a separate `web-idp` app; we have one app, so login
must be a sibling of the guarded block or it guards itself.

## 5. Image path, end to end

```
owner picks a file in /admin
  → web-catalog action → makeAuthenticatedRequest(multipart, field 'image')
  → api-salesops  POST /products/:id/image      JwtAuthGuard → TenantContextGuard → RolesGuard
      FileInterceptor('image') + ParseFilePipe[ MaxFileSize 10MB, FileType /^image\/(jpeg|png|webp|heic|heif)$/ ]
      runInTenant(req.tenant):
        productService.findById(id)                                → 404 if absent
        store.put({ companyId, bytes, declaredMimeType })          → sharp normalize → 'products/<uuid>.webp'
        productRepository.update(id, { image: ref })
      → 200 { id, imageUrl }

disk    $STORAGE_PATH/<companyId>/products/<uuid>.webp      ← mounted volume, part of the deliverable
DB      Product.image = 'products/<uuid>.webp'              ← relative, no companyId, no leading slash

shopper <img src="/public/products/<pid>/image/<key>.webp">
  → api-public  PublicTenantGuard → runInTenant → active check → store.open → stream (D6)
```

`Product.image` holds no `companyId` and no absolute path, so relocating `STORAGE_PATH` or putting a
CDN in front is a config change, never a data migration. Seeded rows
(`products/cafeteras/cafeteras1.jpeg`) satisfy the same ref grammar and serve identically **if** the
bytes are on the volume; if they are not, the endpoint returns `404` and the UI shows a placeholder.
Seeding a dataset is explicitly out of scope, so that is the expected dev state, not a defect.

## 6. Boundaries, enforced

architecture.md:132-141 — a boundary that lives only in a doc breaks on its own. Two additions to
`packages/eslint-config/backend-boundaries.config.js`:

- `frozenStorefrontBoundaryRule` — forbids `@store-mgmt/storefront*` inside `web-catalog`. The design
  is copied by writing new code; the package is never imported.
- `frozenLegacyAppRule` — forbids `@store-mgmt/domain*` inside `apps/static-store`. This is the rule
  the legacy-safe constraint actually needs. The constraint's premise is that static-store imports
  **zero** domain symbols (explore.md claim 10, verified exhaustively) — that verified fact is what
  makes additive domain edits safe, and a lint rule is what keeps it a fact instead of a memory.

**Both rules ship AND are applied.** Wiring `frozenLegacyAppRule` into
`apps/static-store/eslint.config.mjs` is a one-line edit to a FROZEN app, and it is **explicitly
authorised by the owner** ("aplica todas las reglas"). Decided, not open.

This is the **only** authorised edit to a frozen app in this change. It adds no runtime code to
`static-store` — it is lint configuration only, so the frozen app's build output is byte-identical
before and after. Any other change to `apps/static-store`, `packages/storefront` or the appliances
vertical remains forbidden.

## 7. Testing strategy

Strict TDD: every row below is written before its implementation.

| App | Runner | Coverage |
|---|---|---|
| `api-public` | jest, co-located `*.spec.ts` (`rootDir: src`, ts-jest, `--experimental-vm-modules`) | `host-slug` parse table (port, `X-Forwarded-Host`, single label, reserved label, bad chars); guard 404s for unknown / inactive / `schemaName: null` **plus an assertion the three responses are byte-identical** (D4); sort-then-paginate with a fixture where `order` and `finalPrice` disagree; page boundaries and `total` vs page length; DTO contract: key set equals the allow-list (no `cost`/`sku`/`barcode`) **and the value type of every field**, so a JSON number in `percentDiscountPrice`, `discountPrice` or either `amount` is a FAILURE (§3); image 404 matrix and `ETag`/`304`/header exactness (D6) |
| `api-public` | `test/*.e2e-spec.ts` + supertest + `jest-e2e.json` | two slugs against ONE app instance; isolation proven from the `Host` header alone |
| `infra-storage` | jest | put→open round trip on a tmpdir; ref rejection for `..`, absolute, backslash; sharp: EXIF rotate honoured, output is webp, oversize downscaled, non-image → decode error |
| `api-salesops` | existing jest + e2e | upload happy path; `sales` role → 403; oversize → 413; non-image → 400; **existing suites stay green** — `search` absent must not change `list` behaviour |
| `web-catalog` | vitest + jsdom + testing-library (`static-store` convention) | `MN` formats instead of throwing (the named High risk); unknown slug → 404; cookie is `httpOnly` with no `domain` and the token never reaches a loader payload; `/productos` URL params → forwarded query; empty-result state; badge stack (Nuevo + `-10%` + `-$5.00` together) |

Lint budgets follow the app type: NestJS `--max-warnings 0`, React Router `--max-warnings 5`.

## 8. Migration / rollout

No DB migration. `slug` is already `@unique` (`prisma/master/schema.prisma:98`). Rollout needs, in
order: wildcard subdomain routing (`*.localhost` locally), `STORAGE_PATH` with a mounted volume,
`SESSION_SECRET`, and the `api-idp` / `api-salesops` base URLs in `web-catalog`'s env. Rollback is the
proposal's: delete three directories, revert three additive edits.

## 9. Open points

- [ ] **Mixed currencies in one store — deliberately unsolved.** `assertCurrency`
      (`product.controller.ts:35-39`) checks set membership only; nothing forces one currency per
      store. Price sorting compares raw numeric `finalPrice` values **with no conversion**, so a store
      selling in both USD and MN produces an order that is arithmetically correct and commercially
      meaningless. The owner deferred this explicitly and explicitly refused the one-currency-per-store
      assumption. Recorded as a known limitation with its consequence stated; no conversion layer is
      designed here.
- [ ] **Slug→company lookup is uncached**, so every request including every image hits master. A 60 s
      `Map` cache is ~20 lines and removes an N-per-page round trip, but it opens a window where a
      just-deactivated company keeps serving. A wrong cache on a *tenancy* decision is a
      security-shaped bug, so v1 ships without one. Tripwire: p95 on `GET .../image`.
- [ ] **Orphaned image files** accumulate on re-upload (D10). A sweeper is deferred, not forgotten.

Closed since the first draft: applying `frozenLegacyAppRule` to `apps/static-store/eslint.config.mjs`
— the owner authorised it explicitly ("aplica todas las reglas"). See §6.
