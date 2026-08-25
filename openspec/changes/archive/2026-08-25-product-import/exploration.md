# Exploration: product-import (Idempotent bulk product import)

> Read-only investigation. All paths relative to `templates/` unless noted.

## Current State

### api-salesops product module (delivery layer)
- `apps/api-salesops/src/product/product.controller.ts` — REST `@Controller('products')` behind
  `JwtAuthGuard, TenantContextGuard, RolesGuard` (L72-73); all tenant work wrapped in
  `createRunInTenant(tenantContext)` (L76-84). Writes are `@Roles(owner, admin)` (L88, L127).
- **Multipart precedent exists in THIS app**: `POST /products/:id/image` uses
  `FileInterceptor('image')` + `ParseFilePipe(MaxFileSizeValidator, FileTypeValidator)`
  (L154-172), backed by `src/image/upload-constraints.ts` (`MAX_IMAGE_SIZE_BYTES = 10MB`,
  L2). A CSV upload can reuse the exact same pattern — no new infrastructure.
- Error mapping is centralized in `withDomainErrorMapping()` (L284-298):
  `InvalidProductError | InvalidMoneyError | UnsupportedImageError` → 400 with the domain
  message; everything else rethrown. A batch endpoint should NOT use this wholesale (row
  errors must be collected, not thrown) but per-field validation inside the loop maps
  naturally to row-level failure reasons.
- Currency boundary check: `assertCurrency` against a hardcoded `VALID_CURRENCIES =
  {'USD','EUR','MN'}` set (L53-60). The domain's own `Currency` type is the same trio
  (`packages/domain/src/currency/money.ts:4`).
- No global body-size config in `apps/api-salesops/src/main.ts` (L52-55: plain
  `NestFactory.create`, no `bodyParser` limits touched). Nest/Express JSON default is ~100kb,
  so multipart (`multer`) is the right transport for a CSV; Multer memory storage has NO
  default size cap — the route must add its own `MaxFileSizeValidator`.

### api-salesops product service (orchestration)
- `product.service.ts:52-65` — `create()`: runs `createProduct(domainInput)` for money
  invariants BEFORE any I/O, then checks `categoryRepository.findById(input.categoryId)`
  exists (throws `InvalidProductError` otherwise, L58-61), then `productRepository.create`.
- `product.service.ts:67-110` — `update(id, patch)`: validates only the monetary fields the
  partial patch carries via atomic guards (`assertValidProductPrice/Cost/PercentDiscount/
  DiscountPrice`, L70-81); category existence re-checked when `categoryId` present (L83-88).
  **This IS the "update values only" path** — an import update can call exactly this shape:
  patch name/description/sku/barcode/price/categoryId and leave discount/image/isNew/order/
  active untouched when absent. `UpdateProductDto` exists (`dto/update-product.dto.ts`).
- Decimal-string <-> `Money` mapping helpers: `moneyFromDecimalString` / `moneyToDecimalString`
  (`packages/domain/src/currency/money.ts:68-75`; scale 2 for USD/EUR/MN, L10-14).
  Percent/discount scales: `PERCENT_SCALE = 2`, `DISCOUNT_PRICE_SCALE = 2`
  (`packages/domain/src/product/pricing.ts:8,15`).

### Domain factories & ports
- `packages/domain/src/product/product.ts:118-148` — `createProduct`: defaults
  `percentDiscountPrice ?? 0n`, `discountPrice ?? 0n` (L121-125) → matches owner decision
  "discounts 0 on create". Defaults `active ?? true` (L144). `cost >= 0` guard exists
  (`assertValidProductCost`, L103-107) → CSV cost defaults to `0.00` are legal, no schema
  change needed (`CreateProductInput.cost` is required, so import passes an explicit
  zero-Money in the price's currency).
- **No dedicated `updateProduct` factory** — updates go through `ProductUpdateInput =
  Partial<Omit<Product, 'id' | 'createdAt'>>` (`product-repository.port.ts:13`) plus the
  exported atomic guards. That is sufficient for import; nothing to add at domain level.
- `packages/domain/src/product/category.ts:26-36` — `createCategory` requires caller-supplied
  `slug` + `order`. There is NO slugify helper anywhere in the repo (grep for
  `slugify|toSlug|deriveSlug` across templates → only unrelated `normalizeName` seed
  functions in `infra-db/src/commission/seed.ts:265`). Slug derivation from a Camel Case name
  must be written fresh (and unit-tested) as part of this change.

### Category side
- Port `ICategoryRepository` (`category-repository.port.ts:18-25`): has `findBySlug` and
  `list`, but **NO `findByName`** — and Prisma `Category.name` is not unique nor indexed
  (`prisma/tenant/schema.prisma:63-77`; only `slug @unique`).
  Case-insensitive match by NAME therefore means: `list({ includeInactive: true })` +
  in-memory lowercase compare, or a new port method. For an import of hundreds of rows,
  loading all categories once per batch and matching in-memory is simplest and avoids a
  schema migration.
- Slug uniqueness collision handling precedent: duplicate slug surfaces as an error, never a
  silent overwrite (`prisma-category.repository.spec.ts:41-45`).
- Camel Case storage: no existing enforcement — neither `createCategory` nor `createProduct`
  normalizes case. Both names arrive already-cased today (seed data, forms). Import-side
  Camel Case normalization is NEW behavior; decide whether it lives in domain (shared pure
  function, recommended) or app service.

### Idempotency key feasibility
- `IProductRepository` (`product-repository.port.ts:21-27`): `create | update | softDelete |
  findById | list(filter)`. **No `findBySku`, no `findByCategoryIdAndName`.**
- DB reality (`prisma/tenant/schema.prisma:79-112`): `sku String?` nullable and NOT unique;
  no index on `(categoryId, name)` either; only `@@index([categoryId])`.
- Options without schema change: fetch candidates once per batch via
  `list({ includeInactive: true })` (already supports optional `categoryId` filter,
  `product-repository.port.ts:4-10`; search filter is substring-only, insufficient for exact
  ci-match) and build in-memory maps keyed by `lower(sku)` and `lower(categoryId|name)`.
  This is O(products) memory per batch but fine for catalog-scale stores, keeps the port
  untouched, and sidesteps the non-unique-sku problem (first-match wins policy must be
  specified — see Open Questions).
- Alternative: add `findFirstBySku(sku)` / `findFirstByCategoryAndName` port methods +
  Prisma implementations (case-insensitive via `mode: 'insensitive'`, precedent in `list`
  search, `prisma-product.repository.ts:151-158`). Cleaner long-term; more surface area.

### web-catalog admin (frontend)
- Route table `apps/web-catalog/app/routes.ts:21-31` — new route slots as
  `route('admin/productos/importar', 'admin/routes/productos/importar.tsx')` inside the
  `_auth.tsx` layout, sibling of `admin/productos/nuevo`.
- Form pattern: `productos/nuevo.tsx` — `loader`/`action` both wrapped in `withAuth(...)`
  (L14, L47); action reads `request.formData()`, calls server client, catches thrown raw
  `Response` and maps status→Spanish message (L47-89). Spanish copy convention is **Rioplatense
  voseo**: "Revisá los datos del formulario.", "Podés subirla desde la edición."
  (`nuevo.tsx:83-88,72`), titles like "Nuevo producto — Admin".
- Multipart round-trip precedent: `<Form method="post" encType="multipart/form-data">`
  (`nuevo.tsx:101`) + `uploadProductImage` posting raw `FormData` through
  `makeAuthenticatedRequest` which attaches Bearer token + `X-Company-Id`
  (`admin/lib/products.server.ts:73-84`; token/company resolution doc at L4-12). An
  `importProducts(request, companyId, formData)` client function mirrors `uploadProductImage`.
- Per-row report UI: render from action data; no table-report component exists yet — build a
  simple one following `admin/routes/productos/index.tsx` styling conventions.

### CSV parsing
- Grep across all `templates/**/package.json` for `csv|papaparse|csv-parse|d3-dsv|neat-csv`
  → **zero hits**. No CSV library exists anywhere in the monorepo.
- Zero-dependency option: hand-rolled split on `;`. Risk: quoted fields containing `;` or
  embedded newlines. Owner-fixed column list is short and values (names, descriptions)
  plausibly contain semicolons — a small RFC-4180-style parser (~30 lines) with quoted-field
  support is cheap insurance; it belongs in a pure module with its own tests (test utility
  precedent: every app has jest setup, e.g. `apps/web-catalog` colocated `__tests__`).

## Affected Areas
- `templates/apps/api-salesops/src/product/product.controller.ts` — new `POST /products/import`
  (multipart, `FileInterceptor('csv')`, Roles owner/admin, MaxFileSizeValidator).
- `templates/apps/api-salesops/src/product/product.service.ts` (or new `import.service.ts`)
  — batch orchestration: parse → per-row resolve/create/update → report.
- `templates/apps/web-catalog/app/routes.ts` — register `admin/productos/importar`.
- `templates/apps/web-catalog/app/admin/routes/productos/importar.tsx` (+ test) — upload page.
- `templates/apps/web-catalog/app/admin/lib/products.server.ts` — `importProducts()` client.
- New pure modules (recommended home: `packages/domain/src/product/` or an app-local lib):
  CSV parser, Camel Case normalizer, slug derivation, idempotency-key matcher.

## Approaches

1. **In-batch maps over one full `list()` read (no port/schema change)** — service loads
   categories + products once per request, resolves each row against in-memory
   lowercased-keyed maps, creates missing categories on the fly (updating the local map too),
   calls existing `create`/`update` paths per row.
   - Pros: zero migrations; zero port changes; reuses validated create/update paths;
     easy row-level try/catch; matches "few-hundred-row" scale.
   - Cons: O(catalog) memory; races with concurrent writers possible (acceptable for
     admin-only bulk tool); sku-first-match-wins needs a stated rule.
   - Effort: Low/Medium.

2. **New repository query methods (`findBySku`, `findFirstByCategoryAndName`)** + per-row
   lookups.
   - Pros: precise queries; scales beyond thousands of rows; explicit semantics.
   - Cons: touches domain port + adapter + spec files; still needs case-insensitivity care;
     more code for the same outcome at this scale.
   - Effort: Medium.

3. **Prisma `upsert` per row keyed on a new DB unique constraint** (`sku` unique /
   `(categoryId, lower(name))` expression index).
   - Pros: atomic idempotency, DB-enforced.
   - Cons: requires tenant-schema DDL migration (manual `tenant-migrate`, high blast radius
     per main.ts D6 history); `sku` nullable+non-unique today; expression indexes complicate
     Prisma; contradicts owner decision "(a) — no schema change".
   - Effort: High.

## Recommendation
Approach 1. It satisfies owner-decided semantics with no schema change, reuses
`createProduct`/atomic-guard validation and the existing controller error/status patterns,
and the FileInterceptor image-upload path proves multipart end-to-end. Add a tiny pure CSV
parser (quoted fields) + camel-case/slug utilities as tested pure functions. Slug derivation
for created categories: lowercase, strip accents, hyphenate; on slug collision append a
numeric suffix and verify via `findBySlug` before create.

## Risks
- **Non-unique SKU in data** — two existing products may share a sku; import update would
  silently pick one. Needs an explicit first-match rule + report flagging ambiguity (or fail
  ambiguous rows).
- **Case-insensitive category/name matching vs. Unicode** — Spanish names; compare after
  accent-stripping? Owner said "case-insensitively" only; accent-sensitive compare is the
  literal reading, worth confirming in proposal.
- **No transactional boundary per batch** — partial success is BY DESIGN (row errors don't
  abort), but a crash mid-batch leaves a partially imported file; re-running is safe due to
  idempotency keys, which is the mitigation.
- **CSV dialect drift** — BOM, CRLF, quoted separators; the parser must handle UTF-8 BOM and
  `\r\n` explicitly (Windows-sourced exports likely).
- **Multer has no default size cap** — must add MaxFileSizeValidator for the CSV (e.g. 5MB)
  or a malicious/giant upload buffers fully in memory.
- **Camel Case normalization changes user data** ("IPHONE CASE" → "Iphone Case") on UPDATE
  too — confirm that updating an existing product's stored name casing is desired.

## Open Questions
1. Ambiguous duplicate SKUs in existing data: update first match, last match, or fail row?
2. Accent-insensitive matching for category names (e.g. "Climatizacion" vs "Climatización")?
3. Should the CSV also carry optional discount columns later (owner says none today — fine),
   and does an update leave discounts untouched even if price changed? (Assumed yes.)
4. Slug language rules: keep accents stripped? Numbers/punctuation handling?

## Ready for Proposal
Yes — semantics are owner-fixed; recommend Approach 1 with the risks above called out in the
proposal.
