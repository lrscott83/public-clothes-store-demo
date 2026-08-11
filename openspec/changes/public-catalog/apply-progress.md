# Apply Progress: public-catalog

**Batch**: 3 of N (Phase 2 — `packages/infra-storage`)
**Mode**: Strict TDD
**Delivery**: commits only, branch `public-catalog`, no PRs

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

### Test Summary
- **Total tests written this batch (Phase 3)**: 7 (all in `product.controller.spec.ts`)
- **Total tests passing this batch**: 22/22 (`product.controller.spec.ts`, 15 pre-existing + 7 new); 493/493 whole-app unit; 125/125 e2e
- **Cumulative automated tests across Phase 0-3**: domain 341/341, infra-db 437/437, infra-storage 14/14, api-salesops unit 493/493, api-salesops e2e 125/125
- **Pure functions created this batch**: 0 (this phase wires existing pure/adapter code — `normalizeImage`, `FsProductImageStore` — into a new controller route; no new pure logic introduced)
- **Production bug found and fixed this batch**: 1 (`FsProductImageStore` constructor DI resolution, `packages/infra-storage`, see 3.3 row and "Issues Found")

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

## Commits (17 total, in order)

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

Phase 2 (3):
14. `88c69d1` feat(public-catalog): add FsProductImageStore adapter (2.1-2.2)
15. `fc98d4e` feat(public-catalog): normalize uploaded images to upright webp (2.3-2.4)
16. `544d3c4` test(public-catalog): prove product images survive a process restart (2.5-2.6)

(Task-numbered plan called for 5 commits for Phase 1, landed exactly as 5 —
now 6 with the apply-progress doc commit. Phase 2's plan called for 3
work-unit commits (2.1-2.2, 2.3-2.4, 2.5-2.6); landed exactly as 3.)

Phase 3 (1, per tasks.md's explicit "1 commit" done-criterion):
17. (this commit) feat(public-catalog): add authenticated product image
    upload to api-salesops (3.1-3.4) — includes the `FsProductImageStore`
    DI fix and the tasks.md/apply-progress.md updates in the same commit,
    matching the task's own 1-commit budget. Exact SHA: see `git log`
    (self-referencing a hash inside the commit that produces it is not
    possible — the tree hash depends on this file's own content).

## Remaining Tasks

Phase 4 through Phase 7 — NOT started, per explicit scope instruction
("Phase 3 ONLY... then STOP"). Next tasks in file order:
- [ ] Phase 4: `apps/api-public` full build-out (7 commits — host-slug,
      public tenant guard, sort-then-paginate service, DTO contract, image
      serving, e2e two-slug isolation)
- [ ] Phase 5: `apps/web-catalog` public storefront (4 commits)
- [ ] Phase 6: `apps/web-catalog` `/admin` (6 commits)
- [ ] Phase 7: final verification

## Status

Phase 0-2: 20/20 work units complete (carried forward from the prior
batch's own count — 4 spikes + 8 Phase 1 tasks + 6 Phase 2 tasks — not
re-audited this batch, out of Phase 3's assigned scope).
Phase 3: 4/4 tasks complete (3.1-3.4), 1 commit, matching tasks.md's
explicit done-criteria. `api-salesops` unit suite: 486→493 tests (+7, zero
regressions, zero pre-existing assertions edited). `api-salesops` e2e suite:
125→125 tests (unchanged count, zero regressions) — dropped to 0/10 passing
mid-batch when `InfraStorageModule` wiring exposed a latent Phase 2 DI bug,
fixed in `packages/infra-storage` (not a test edit), back to 125/125.
Lint (`--max-warnings 0`) and `tsc --noEmit` clean on both `api-salesops`
and `packages/infra-storage`. Ready for the next `sdd-apply` batch (Phase 4
— `apps/api-public`, a NEW app).
