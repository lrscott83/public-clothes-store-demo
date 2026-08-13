## Verification Report

**Change**: public-catalog
**Branch**: `public-catalog` @ `19baa4e` (44 commits ahead of `main`)
**Version**: spec deltas at their only commit, `b5dcb55` (never amended — confirmed via `git log`)
**Mode**: Strict TDD

This is the first formal `sdd-verify` pass for this change. Prior "Phase 7 COMPLETE"
claims (engram #2147) were the apply phase's own self-check, not an independent
verification. All evidence below was reproduced independently in this session:
full monorepo `lint typecheck test` was re-run, all three apps' `test:e2e` suites
were re-run against a real Postgres instance (reachable via the Docker bridge
gateway, `172.17.0.1:5432` — `localhost:5432` is not reachable in this
environment), and a sample of the new/changed test files was read directly to
audit assertion quality, not just trusted from the apply-progress narrative.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total (tasks.md) | 53 |
| Tasks complete (`[x]`) | 53 |
| Tasks incomplete | 0 |

**Artifact-sync finding (WARNING, see Issues)**: `apply-progress.md` on disk stops
at commit `3070a34` (task 6.5) and never records 6.6, 6.7, or Phase 7 — those five
commits (`474a7c9`, `9782b27`, `dad4e27`, `7c80c10`, `19baa4e`) only touch
`tasks.md` checkboxes and app code, never `apply-progress.md`. `tasks.md` itself
(the openspec source of truth) correctly shows all 53 items checked, and git log
confirms the corresponding code/test commits exist and are real — this is a
documentation-artifact gap, not a missing-implementation gap.

### Build & Tests Execution

**Lint**: ✅ Passed — `pnpm turbo run lint typecheck test` (from `templates/`), 42/42 tasks successful.
- NestJS apps (`api-public`, `api-salesops`, `api-idp`, `infra-db`, `infra-storage`, `domain`, `api-common`): 0 errors, 0 warnings (`--max-warnings 0`)
- `web-catalog`: 0 errors, 0 warnings (budget `--max-warnings 5`)
- `static-store`: 0 errors, 5 warnings (at its own budget — same file/line set as task 1.8's recorded baseline; only 1 authorised line changed in this app, see 7.2 reproduction below)
- `salesops-mvp`: 0 errors, 3 warnings (unrelated legacy app, untouched by this change)

**Typecheck**: ✅ Passed — 0 errors across all packages/apps in the same turbo run.

**Tests** (unit/integration, `pnpm turbo run test`, real Postgres via `172.17.0.1:5432`):
```text
domain              341/341  (32 files)
storefront           43/43   (8 files)   — frozen package, untouched, unaffected
web-common            11/11  (1 file)    — untouched
infra-db             437/437 (47 suites) — real Postgres
infra-storage         14/14  (3 suites)
api-common            45/45  (5 suites)  — untouched (confirms D3: api-public does not depend on it)
api-public            60/60  (9 suites)  — NEW app
api-salesops         495/495 (25 suites)
api-idp               71/71  (6 suites)
static-store          96/96  (18 files)  — only 1.8's eslint line touched
web-catalog          146/146 (28 files)
salesops-mvp         534/534 (75 files)  — untouched legacy app
```
All counts reproduced independently and match the apply-progress/engram-#2147
claimed baselines exactly.

**E2E tests** (not covered by `turbo run test`; run separately via `test:e2e`
against real Postgres, `domain`/`infra-db`/`infra-storage` built to `dist/` first):
```text
api-public    e2e   5/5   (1 suite)  — tenant-isolation.e2e-spec.ts
api-salesops  e2e   125/125 (10 suites) — unchanged from pre-Phase-3 baseline
api-idp       e2e   13/13  (2 suites)  — task 6.5's GET /companies/:slug covered
```

**Coverage**: Not available — no coverage tool configured in this repo (jest/vitest run without `--coverage`). Not a failure, per strict-TDD-verify rules.

### Diff-audit reproduction (task 7.2, re-run independently)
- `git diff main...public-catalog --stat -- templates/packages/storefront templates/packages/api-common` → empty. Both frozen/untouched packages confirmed zero changes.
- `git diff main...public-catalog -- templates/apps/static-store` → exactly the 2-line `frozenLegacyAppRule` import+spread from task 1.8. No other file in `static-store` touched.
- `git diff main...public-catalog -- templates/apps/api-idp/package.json` → empty (no new dependency, transitive or direct).
- Full diff stat: 172 files changed, +13095/-18 (grew from the previously-recorded 162/+10346/-18 as 6.6/6.7 landed after that count was taken — consistent, not a discrepancy).

### Spec Compliance Matrix

**public-catalog**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Server-side search/filter/sort/pagination | Case-insensitive search matches name+description | `prisma-product.repository.spec.ts` (1.5/1.6) | ✅ COMPLIANT |
| | Default sort is featured order | `public-product.service.spec.ts` | ✅ COMPLIANT |
| | Category filter excludes other categories | `public-product.service.spec.ts` | ✅ COMPLIANT |
| Price sort uses finalPrice, sorted before pagination | Sorts by finalPrice not list price | `public-product.service.spec.ts` (order-vs-finalPrice-disagree fixture) | ✅ COMPLIANT |
| | Page 2 reflects global sort | `public-product.service.spec.ts` (13-item page-boundary case) | ✅ COMPLIANT |
| Inactive/soft-deleted never returned | Inactive product excluded from listing | `public-product.service.spec.ts` (`active:false` never passed) | ✅ COMPLIANT |
| | includeInactive param ignored | `public-product.service.spec.ts:137` `expect(passedFilter.includeInactive).not.toBe(true)` | ✅ COMPLIANT |
| Public DTO excludes internal data | cost/sku/barcode absent even when set | `public-product.controller.spec.ts:124` key-set equality assertion | ✅ COMPLIANT |
| Offer/badge data surfaced independently, decimal strings | Both discounts uncollapsed, decimal strings | `public-product.controller.spec.ts:139-142` (`typeof ... 'string'`, exact `"20.00"`/`"5.00"`) | ✅ COMPLIANT |
| Money formatting supports non-ISO currencies | MN formats without throwing | `money.test.ts` (spike 0.4, 5 tests) | ✅ COMPLIANT |
| | USD/EUR format normally | `money.test.ts` | ✅ COMPLIANT |
| Public image serving respects active state and tenant ownership | Inactive product's image not served | `product-image.controller.spec.ts` (D6 matrix) | ✅ COMPLIANT |
| | Cross-tenant file never served | `product-image.controller.spec.ts` + `image-url.spec.ts` (explicit `companyId` arg, D1) | ✅ COMPLIANT |
| | Active image served with immutable cache header | `product-image.controller.spec.ts` (exact header assertions) | ✅ COMPLIANT |

**catalog-admin**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| httpOnly server-side cookie session | Login never exposes token to client | `session.test.ts` (11 tests, D8) | ✅ COMPLIANT |
| Admin routes require owner/admin role | Non-owner/admin denied | pre-existing `RolesGuard`/`TenantContextGuard` (api-common, api-salesops), reused via D7 — `@Roles(owner, admin)` on every mutation endpoint | ✅ COMPLIANT |
| | owner/admin granted | same guard chain, `product.controller.spec.ts` | ✅ COMPLIANT |
| Store fixed by subdomain, re-verified per mutation | Admin edits own company's product | `editar.test.tsx` (products, categories) | ✅ COMPLIANT |
| | Cross-company mutation rejected | `editar.test.tsx:84-247` — `expect(result).not.toBeInstanceOf(Response)` on 403, both update and soft-delete, products AND categories, plus upload | ✅ COMPLIANT |
| | No store-switcher control | manual grep: zero "switcher" references in `app/admin/**`; design D9 confirms no selector built | ✅ COMPLIANT |
| Full CRUD for products/categories | Admin creates a product | `nuevo.test.tsx` (6.5) | ✅ COMPLIANT |
| | Admin updates a category | `editar.test.tsx` (categorias, 6.6) | ✅ COMPLIANT |
| Deletes are always soft | Deleting sets active=false, row persists | `editar.test.tsx:127` categorias — explicit "never hard-deleted" assertion; live SQL-verified smoke test in engram #2147 §7.4 | ✅ COMPLIANT |

**salesops-companies**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| findBySlug on ICompanyRepository | Resolves existing company incl. isActive/schemaName | `prisma-company.repository.spec.ts` (1.1/1.2, real Postgres) | ✅ COMPLIANT |
| | Returns null for unknown slug | same file | ✅ COMPLIANT |

**salesops-products**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Authenticated image upload | owner/admin uploads valid image | `product.controller.spec.ts` (3.1/3.2, 7 new cases) | ✅ COMPLIANT |
| | Non-owner/admin rejected | same file, `image` unchanged asserted | ✅ COMPLIANT |
| Size/MIME allowlist | Oversized rejected (413) | same file | ✅ COMPLIANT |
| | Disallowed MIME rejected (400), nothing written | same file — `98f1ef4` widened this to real magic-number sniffing (documented deviation, strengthens D10) | ✅ COMPLIANT |
| Extension from validated MIME, never client filename | Hostile filename ignored | `product.controller.spec.ts:395` "hostile filename that disagrees with the real content is IGNORED" | ✅ COMPLIANT |
| Tenant-scoped storage, UUID filename | Two companies never share a path | `fs-product-image.store.spec.ts` (2.1/2.2, per-company scoping case) | ✅ COMPLIANT |

**salesops-tenancy**
| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Anonymous subdomain tenant resolution | Known/active/provisioned slug resolves, no auth | `public-tenant.guard.spec.ts` (4.3/4.4) | ✅ COMPLIANT |
| | Public resolution never invokes authenticated guard chain | same file — explicit "no-api-common-import" static-scan assertion | ✅ COMPLIANT |
| Unknown slug / inactive company → indistinguishable 404 | Unknown slug 404 | `public-tenant.guard.spec.ts:100` | ✅ COMPLIANT |
| | Inactive/unprovisioned 404, identical | `public-tenant.guard.spec.ts:108,116` | ✅ COMPLIANT |
| | Two causes byte-identical | `public-tenant.guard.spec.ts:127-165` — status, body, AND stable-headers diff, all three cases (unknown, inactive, `schemaName:null`) | ✅ COMPLIANT |

**Compliance summary**: 26/26 spec scenarios compliant, all with a passing covering test reproduced in this session (or, for the two admin manual-smoke items, a passing automated test PLUS the prior session's SQL-verified live smoke, which this pass did not need to re-run given the automated coverage is already sufficient and load-bearing).

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ⚠️ Partial | `apply-progress.md`'s "TDD Cycle Evidence" table covers Phase 0-4 only (rows for tasks 0.1-4.11). Phases 5, 6, and 7 have narrative RED/GREEN/test-count descriptions in the "Completed Tasks" prose but no formal table rows. |
| All tasks have tests | ✅ | Every non-docs task has an associated `*.test.ts`/`*.test.tsx`/`*.spec.ts` file, confirmed by reading the actual test files listed above and by the reproduced suite counts. |
| RED confirmed (tests exist) | ✅ | All referenced test files exist in the working tree at their claimed paths. |
| GREEN confirmed (tests pass) | ✅ | 100% reproduced pass in this session (domain 341, infra-db 437, infra-storage 14, api-common 45, api-public 60+5e2e, api-salesops 495+125e2e, api-idp 71+13e2e, static-store 96, web-catalog 146, storefront 43, web-common 11, salesops-mvp 534). |
| Triangulation adequate | ✅ | Spot-checked: DTO contract test triangulates key-set + per-field type; 404-identity test triangulates status+body+headers across 3 causes; badge-stack test triangulates each badge alone and all three together. |
| Safety Net for modified files | ✅ | Every phase's evidence log records a "re-run pre-existing suite, zero edits" step before/after its own changes (e.g., Phase 3's 15/15→22/22, Phase 4's byte-identical regression proof, `static-store`'s build/lint re-verification). |

**TDD Compliance**: 5/6 checks fully passed, 1 partial (table coverage gap — WARNING, not CRITICAL, since the underlying RED/GREEN work is independently verifiable and was reproduced).

---

### Test Layer Distribution
| Layer | Tests (approx, this change's new/touched files) | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~230 | ~45 | vitest (web-catalog), jest (Nest apps) |
| Integration | ~90 | ~15 | jest+ts-jest+real Postgres (infra-db, infra-storage restart-proof) |
| E2E | 18 | 3 suites | jest+supertest against real Postgres (api-public, api-salesops unaffected-baseline, api-idp) |
| **Total (new to this change)** | **~340** | ~63 | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected/configured in this repo's jest/vitest configs.

### Assertion Quality
No tautologies, ghost loops, or assertion-without-production-call patterns found in the sampled files
(`public-tenant.guard.spec.ts`, `public-product.controller.spec.ts`, `editar.test.tsx` ×2,
`product.controller.spec.ts`, `product-card.test.tsx`). All sampled tests assert concrete, varying
expected values (exact 404 body diffs, exact decimal strings, exact 403-vs-302 result shape,
exact badge text) rather than smoke-only `toBeInTheDocument()` checks.

**Assertion quality**: ✅ All sampled assertions verify real behavior. Full-repo scan for the
`expect(true).toBe(true)` tautology pattern across `apps/api-public`, `apps/web-catalog`,
`apps/api-salesops/src/product`, `packages/infra-storage`, `apps/api-idp/src/company` returned
zero matches.

### Quality Metrics
**Linter**: ✅ No errors, budgets respected (0 for NestJS apps, ≤5 for web-catalog, 5/5 static-store at its pre-existing baseline)
**Type Checker**: ✅ No errors, 0 typecheck failures across all 12 packages/apps

---

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 — IProductImageStore, intent-based port | ✅ Yes | `companyId` explicit arg on both `put`/`open`, no ambient state |
| D2 — Public guard resolves tenant, does not open ALS scope itself | ✅ Yes | confirmed in `public-tenant.guard.ts`, every handler re-opens via `runInTenant` |
| D3 — `api-public` copies `runInTenant`, no `api-common` dependency | ✅ Yes | `api-common` test suite (45/45) unchanged, confirms zero coupling |
| D4 — Unknown slug / inactive company: byte-identical 404 | ✅ Yes | reproduced via automated test + prior live smoke |
| D5 — Sort by finalPrice after DB, before pagination | ✅ Yes | one documented deviation: `nombre` sort hardcodes `'es'` locale (Phase 5 wiring not threaded through yet) — recorded, not silent, does not break the spec |
| D6 — Immutable content-keyed image URLs | ✅ Yes | full 404/304/200 header matrix tested |
| D7 — `web-catalog` doesn't gate by role, `api-salesops` does | ✅ Yes | `withAuth` only guarantees a session; 403 handling verified in cross-company tests |
| D8 — Host-only session cookie, no `domain` | ✅ Yes | `session.test.ts` asserts `domain: undefined` explicitly |
| D9 — StoreConfig rewritten (not imported from frozen `storefront`) | ✅ Yes | `frozenStorefrontBoundaryRule` wired and enforced by lint (0 errors) |
| D10 — sharp is the real gate, extension from output only | ✅ Yes | strengthened post-hoc by `98f1ef4` (magic-number sniffing re-enabled) — a widening, not a contradiction, and documented as such |

### Issues Found

**CRITICAL**: None.

**WARNING**:
1. **Apply-progress artifact is stale relative to the actual implementation.** `openspec/changes/public-catalog/apply-progress.md` (the file — the source of truth per this run's instructions) was last updated at commit `3070a34` (task 6.5) and never records tasks 6.6, 6.7, or Phase 7's final verification, even though `tasks.md` and `git log` both show all of that work landed and complete. The corresponding engram observation (#2147) *does* contain Phase 7's evidence in full, so the information exists — it just never made it into the committed file, breaking the hybrid-mode guarantee that file and engram stay in sync. Recommend updating `apply-progress.md` before archive so the committed artifact trail is complete on its own, without depending on engram.
2. **TDD Cycle Evidence table stops at Phase 4.** Phases 5-7 have real RED/GREEN narrative and reproducible test evidence, but never got formal table rows per `strict-tdd-verify.md`'s expected format. Not blocking — I independently reproduced every test count — but it's a process-consistency gap worth closing before archive, same fix as issue 1 (both live in the same file, same missing update).

**SUGGESTION**:
1. Coverage tooling is not configured anywhere in this repo, so changed-file coverage could not be reported. Not a defect of this change specifically (repo-wide gap), but worth a future backlog item if coverage gates become a goal.
2. Design §9's two deferred items (slug→company cache, multi-currency normalization) and D10's orphan-image sweeper remain correctly un-tasked and un-implemented, exactly as scoped. No action needed — flagging only so archive doesn't mistake their absence for a miss.

### Verdict
**PASS WITH WARNINGS** — 0 CRITICAL, 2 WARNING (both about a stale/incomplete documentation artifact, not missing functionality or failing tests), 2 SUGGESTION (informational). All 53 tasks complete, all 26 spec scenarios compliant with independently-reproduced passing tests, full monorepo lint/typecheck/test/e2e green, diff-audit confirms frozen packages/apps untouched beyond the one authorised line. Recommend updating `apply-progress.md` to close the two WARNINGs, then proceed to `sdd-archive`.
