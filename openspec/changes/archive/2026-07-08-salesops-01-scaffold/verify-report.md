## Verification Report

**Change**: salesops-01-scaffold (App Skeleton, Task 1 only)
**Version**: N/A
**Mode**: Strict TDD (test runner `pnpm --filter salesops-mvp test`)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

All 20 tasks in `tasks.md` are marked `[x]` and match the actual repo state (files exist, commits present on branch `salesops-mvp`: `79f87a7`, `0cfbeb4`, plus a docs commit for SDD artifacts).

### Build & Tests Execution (fresh run, this session)

**Tests**: ✅ 15 passed / 0 failed / 0 skipped
```text
$ pnpm --filter salesops-mvp test
 ✓ app/__tests__/root.test.tsx (2 tests) 2ms
 ✓ app/components/__tests__/product-card.test.tsx (2 tests) 30ms
 ✓ app/components/__tests__/sidebar.test.tsx (2 tests) 69ms
 ✓ app/routes/__tests__/routes.test.tsx (9 tests) 162ms
 Test Files  4 passed (4)
      Tests  15 passed (15)
```

**Typecheck**: ✅ Passed
```text
$ pnpm --filter salesops-mvp typecheck
> react-router typegen && tsc
(zero output, exit 0)
```

**Build**: ✅ Passed (ran after `rm -rf build` to force a clean rebuild)
```text
$ pnpm --filter salesops-mvp build
✓ 1511 modules transformed.
Prerender (html): / -> build/client/index.html
Prerender (html): SPA Fallback -> build/client/__spa-fallback.html
✓ built in 148ms
```
`build/client/index.html` exists and contains the literal string "Bienvenido al Sales Ops Cockpit" (verified via `rg`) plus the rendered sample ProductCard — confirms `prerender:['/']` produces a real, populated static landing page, not an empty shell.

**Concurrent dev/preview servers**: ✅ Confirmed independently this session — `salesops-mvp` on :3355 and `static-store` on :3344 both returned HTTP 200 while running simultaneously (`vite preview` on both apps in parallel).

**Turbo task graph**: ✅ Confirmed independently — `pnpm exec turbo run build --dry=json --filter=@store-mgmt/salesops-mvp` (run from `templates/`) includes a `@store-mgmt/salesops-mvp#build` task with full file-hash inputs. `git log -- turbo.json` shows `turbo.json` was last touched in the initial monorepo scaffold commit (`3dc115c`, 2026-07-02), predating all `salesops-mvp` commits — confirms zero `turbo.json` edits were needed.

**Coverage**: informational only (v8 provider configured in `vitest.config.ts`)
```text
$ pnpm exec vitest run --coverage
 app/components/product-card.tsx  100% stmt / 100% branch
 app/components/sidebar.tsx        100% stmt / 100% branch
 app/routes/_shell.tsx             100% stmt / 100% branch
 app/data/catalog.ts               100% stmt / 33.33% branch (L22-23, resolveCatalogImage edge branches)
 app/root.tsx                       50% stmt (L34-60 = ErrorBoundary, untested)
 app/routes.ts                       0% stmt (declarative RR7 route-config array, no logic to cover)
 app/routes/home.tsx                80% stmt (L6-10 = meta())
 7x placeholder routes             81.81% stmt each (meta() uncovered)
```
Note: the coverage run also picked up compiled `build/client/assets/*.js` bundles (0% — expected, they're build output, not source) because `vitest.config.ts` coverage has no `exclude` for `build/**`. Cosmetic only — does not affect the pass/fail verdict. See SUGGESTION below.

### Spec Compliance Matrix
| Requirement | Scenario | Test / Evidence | Result |
|-------------|----------|------|--------|
| Workspace Registration | App resolves via workspace filter | `pnpm --filter salesops-mvp <script>` resolves exactly one package (fresh run); `turbo run build --dry=json` includes it, zero `turbo.json` edits (verified) | ✅ COMPLIANT |
| Workspace Registration | Package installs cleanly | apply-progress: `pnpm install` at `templates/` resolves cleanly (only pre-existing `lucide-react` peer-dep warning, same as static-store) — not independently re-run this session (would require full reinstall); accepted on reported evidence + working `pnpm --filter` resolution as corroboration | ✅ COMPLIANT |
| Distinct Dev Server Port | Dev server starts on 3355, no conflict with 3344 | `vite.config.ts` server/preview port 3355; independently verified this session: both apps' preview servers return HTTP 200 concurrently | ✅ COMPLIANT |
| Sidebar Layout / 7 Routes | All 7 routes resolve inside persistent sidebar with distinguishable heading | `app/routes/__tests__/routes.test.tsx` (9 tests, `it.each` over 8 paths incl. index) — passing | ✅ COMPLIANT |
| Sidebar Layout / 7 Routes | Sidebar lists exactly 7 nav links | `app/components/__tests__/sidebar.test.tsx` — `expect(links).toHaveLength(7)` — passing | ✅ COMPLIANT |
| Local Catalog / ProductCard | ProductCard renders product name + `formatMoney`-formatted price | `app/components/__tests__/product-card.test.tsx` — asserts literal text `'$1,234.50'` via `formatMoney`, not string concat — passing | ✅ COMPLIANT |
| Local Catalog / ProductCard | Referenced product images exist locally | Independently verified this session: scripted check against `catalog.json`'s 99 `image` fields vs `public/catalog/appliances/**` — 0 missing | ✅ COMPLIANT |
| Test Suite Passes | Filtered test run is green | `pnpm --filter salesops-mvp test` — 15/15 passing (fresh run) | ✅ COMPLIANT |
| Typecheck/Build | Typecheck passes | `pnpm --filter salesops-mvp typecheck` — zero errors (fresh run) | ✅ COMPLIANT |
| Typecheck/Build | Production build succeeds, avoids the 4 known gotchas | Clean `rm -rf build && build` — succeeds; all 4 gotcha workarounds present and functioning (see Coherence table) | ✅ COMPLIANT |

**Compliance summary**: 10/10 scenarios compliant.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| `package.json` name `@store-mgmt/salesops-mvp`, no `@store-mgmt/domain`, no gh-pages | ✅ Implemented | Verified by direct read; deps match design exactly |
| `_shell` layout wraps index + 7 children | ✅ Implemented | `app/routes.ts` — single `layout()` call, index nested inside |
| Sidebar always-visible, 7 links, active state via `aria-current` | ✅ Implemented | `app/components/sidebar.tsx` |
| ProductCard uses `formatMoney` from storefront, not string concat | ✅ Implemented | `app/components/product-card.tsx` L32 |
| `home.tsx` renders one ProductCard as smoke proof, no order-state code | ✅ Implemented | `app/routes/home.tsx` — single sample product, no localStorage/cart logic |
| Deduped placeholder markup | ✅ Implemented | `app/components/placeholder-screen.tsx` (18 lines), all 7 route files are 15-line thin wrappers |
| Out-of-scope items untouched | ✅ Confirmed | No `@store-mgmt/domain` dep, no localStorage/seed/order-state, no chart lib, no GH Pages machinery in this app's files |

### Coherence (Design) — Gotcha Workarounds
| Decision | Followed? | Notes |
|----------|-----------|-------|
| `css.postcss.plugins: []` (avoid root Tailwind-3 crash) | ✅ Yes | `vite.config.ts` L23 |
| `resolve.dedupe: ['react','react-dom','react-router']` | ✅ Yes | `vite.config.ts` L38 |
| `resolve.alias: {'react-router-dom':'react-router'}` | ✅ Yes | `vite.config.ts` L46 |
| `optimizeDeps.include` storefront subpaths (`/theme`,`/catalog`,`/config`) | ✅ Yes | `vite.config.ts` L53-57 |
| Port 3355 (server + preview) | ✅ Yes | `vite.config.ts` L26,30 |
| `ssr: false` | ✅ Yes | `react-router.config.ts` L11 |
| `prerender: ['/']` | ✅ Yes | `react-router.config.ts` L15; independently confirmed `build/client/index.html` is emitted with real content |
| RR8 future flags true, `v8_viteEnvironmentApi` OFF | ✅ Yes | `react-router.config.ts` L28-33 — only 4 flags set true, `v8_viteEnvironmentApi` correctly absent (build shows its harmless warning, exactly as documented) |
| `tsconfig.json` self-contained (no extends), `resolveJsonModule` | ✅ Yes | No `extends` field; `resolveJsonModule: true`, `include: ["**/*", ...]` |
| Index route inside `_shell` (sidebar always visible) | ✅ Yes | `app/routes.ts` |

All documented gotcha workarounds are present and functionally verified (build actually succeeds under the conditions each workaround guards against).

---

### Deviation Review (explicitly requested)

**Deviation (a) — `app/data/catalog.ts` imports `catalog.json` from `public/` via a relative path**

```ts
import catalogData from '../../public/catalog/appliances/catalog.json';
```

Judgment: **not a bug, functionally sound, but has one real efficiency cost — flagged as SUGGESTION, not WARNING/CRITICAL.**

- **Build-time**: this is a static ES module import, resolved by Vite/Rollup at build time (not a runtime `fetch`). Confirmed by inspecting the build output: `build/client/assets/home-DJXnGfSq.js` is 20,808 bytes — consistent with the 24,993-byte `catalog.json` being parsed and inlined as a JS module by Vite's built-in JSON plugin. TypeScript resolves it too, via `resolveJsonModule: true` + `include: ["**/*", ...]` in `tsconfig.json` (the JSON file is inside the app's project root, just under `public/` rather than `app/`), and `pnpm --filter salesops-mvp typecheck` confirms zero errors.
- **Runtime**: because the data is baked into the JS bundle at build time, there is no runtime dependency on the file actually being served from `public/` — the app would still work even if that static file were deleted post-build (the JS bundle already carries the parsed data). So this is **not a latent bug**.
- **Real cost found**: `catalog.json` ends up in the build output **twice** — once inlined/re-serialized into `home-*.js` (~20.8 KB) and once again copied verbatim as a static asset at `build/client/catalog/appliances/catalog.json` (~24.9 KB), because Vite's public-dir copy step runs independently of the JS bundler's JSON-inlining. Nothing in the app currently `fetch()`es the public copy — it's dead weight in the shipped build (~25 KB duplicated payload). Not a functional defect, but worth fixing in a follow-up (either stop copying `catalog.json` itself into `public/` and only keep the images there, or fetch it at runtime instead of statically importing it, not both).

**Deviation (b) — routes integration test simplified (multi-route stub assertion instead of `<Link>` click navigation)**

Judgment: **confirmed as a genuine environment limitation, not an app defect, and the replacement test does validate the intended spec scenario.**

- Independently reproduced this session: wrote a throwaway test using `@testing-library/user-event`'s `user.click()` on a real `<Link>` inside the actual `_shell`/`Home`/`PedidosNuevo` route stub, ran it with `vitest`, and got the exact same failure reported in apply-progress:
  ```
  TypeError: RequestInit: Expected signal ("AbortSignal {}") to be an instance of AbortSignal.
    at ... node:internal/deps/undici/undici ...
    at createClientSideRequest (react-router@7.18.1 .../chunk-SA4DP3SF.js:5291:10)
    at startNavigation (.../chunk-SA4DP3SF.js:1999:19)
  ```
  This originates deep inside React Router 7.18.1's client-side data-router (`createClientSideRequest` constructing a `Request` via Node's built-in `undici`), colliding with jsdom's `AbortSignal` implementation (different realm/class, fails `instanceof` inside undici's WebIDL validation). This is a known class of jsdom+undici incompatibility unrelated to any code in this app — confirmed by the stack trace pointing entirely into `node_modules/react-router` and `node:internal/deps/undici`, with zero app-code frames involved. (Throwaway test file was deleted after the probe; `git status` confirms no residual diff.)
  - **Same-realm caveat**: `router.navigate()` (imperative, non-Link programmatic navigation via `useNavigate()`) was not separately probed and might behave differently, but that is out of scope for this spec (the spec only requires route resolution, not navigation-triggered-by-Link mechanics).
- The actual replacement test (`app/routes/__tests__/routes.test.tsx`) uses `createRoutesStub` with a fresh `initialEntries={[path]}` per route (`it.each` over all 8 paths) and asserts: (1) the sidebar `nav` is present, (2) the route's distinguishable stub heading is present. A second test asserts the nav link count is identical (7) regardless of which route is the active initial entry. This directly covers the spec's actual wording: *"WHEN a request is made to each of: `/`, ... THEN each route resolves ... AND each non-index route renders inside the persistent sidebar layout with a distinguishable stub heading"* — which is phrased as per-route resolution (analogous to a fresh request/URL visit), not as a live client-side transition test. The spec does not require proving that a `<Link>` click preserves the shell without full remount; it requires that navigating directly to each route resolves the route inside the shell. The replacement test satisfies this as written.
- Design's Testing Strategy row ("Router resolves ... `_shell` renders sidebar once and stays visible on every route") is slightly broader in spirit than the spec text, but the replacement test's second assertion (identical 7-link nav across all 8 initial routes) is reasonable corroborating evidence for "stays visible on every route," even without literal click-driven transitions.

---

### Assertion Quality (Strict TDD Audit)
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| `app/__tests__/root.test.tsx` | 29 | `expect(element).not.toBeNull()` | Type-only assertion, sole assertion in that `it` block (documented jsdom nested-`<html>` limitation) | SUGGESTION |

No tautologies, no ghost loops, no assertions that skip production code, no CSS-class/implementation-detail coupling found. `routes.test.tsx`'s `for` loop iterates a static non-empty literal array (`ROUTES`, 8 entries) — not a ghost-loop risk. `product-card.test.tsx` and `sidebar.test.tsx` assert concrete, non-trivial values (`'$1,234.50'`, link count `7`, `aria-current` on the correct link).

**Assertion quality**: 0 CRITICAL, 0 WARNING, 1 SUGGESTION.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Full "TDD Cycle Evidence" table present in apply-progress, covering all 4 TDD task groups |
| All tasks have tests | ✅ | 4/4 TDD task groups have corresponding test files, all exist on disk |
| RED confirmed (tests exist) | ✅ | `root.test.tsx`, `sidebar.test.tsx`, `routes.test.tsx`, `product-card.test.tsx` all present |
| GREEN confirmed (tests pass) | ✅ | 15/15 pass on fresh execution this session |
| Triangulation adequate | ✅ | sidebar (2 cases: count + active-state), product-card (2 cases: name + formatted price), routes (9 cases: 8 per-route + 1 cross-route nav-count) |
| Safety Net for modified files | ➖ N/A | All files in this change are new (no pre-existing files modified) |

**TDD Compliance**: 6/6 checks passed.

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 6 | 3 (`root`, `sidebar`, `product-card`) | Vitest + RTL |
| Integration | 9 | 1 (`routes.test.tsx`, `createRoutesStub`) | Vitest + RTL + react-router `createRoutesStub` |
| E2E | 0 | 0 | Not installed (no Playwright/Cypress in this app) |
| **Total** | **15** | **4** | |

### Quality Metrics
**Linter**: ➖ Not run this session (`pnpm --filter salesops-mvp lint` not in the required verification commands per task instructions; not a spec requirement — SUGGESTION to run before archive if desired)
**Type Checker**: ✅ No errors (`pnpm --filter salesops-mvp typecheck` — zero errors, fresh run)

### Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**:
1. `app/data/catalog.ts` causes `catalog.json` to ship twice in the production build (once inlined into `home-*.js`, once as a duplicate static file under `build/client/catalog/appliances/catalog.json`) — ~25 KB of unused duplicate payload. Not a defect; consider either dropping the JSON from the static-served copy (keep only images in `public/`) or switching to a runtime fetch, in a follow-up task.
2. `vitest.config.ts` coverage has no `exclude` for `build/**`, so `--coverage` runs pick up compiled JS bundles as 0%-covered "source," muddying the aggregate percentage. Cosmetic; add `coverage.exclude: ['build/**', '.react-router/**']` in a follow-up.
3. `app/root.tsx`'s `ErrorBoundary` (lines 34-60) has no direct test coverage (50% stmt coverage on the file). It's standard React-Router-generated boilerplate and out of Task 1's scope, but a future task could add a thin RED/GREEN test for the 404 vs generic-error branches.
4. `app/__tests__/root.test.tsx`'s second `it` block asserts only `expect(element).not.toBeNull()` — a type-only assertion, justified by a documented jsdom limitation (nested `<html>` can't be rendered/inspected via RTL's DOM-based `render()`), and the sibling `Layout` test in the same file does assert real structural values (`element.type === 'html'`, `props.lang === 'en'`). Low-risk; no action required.

### Verdict
**PASS**

All 20 tasks complete and verified against actual code state. All 10 spec scenarios are COMPLIANT with passing, non-trivial covering tests (15/15 green, independently re-run this session). Typecheck and build both succeed from a clean state. All 4 documented gotcha workarounds are present and functioning. Both flagged deviations were independently investigated: (a) the `public/`-relative catalog import is a working, non-fragile build-time pattern with a minor duplicate-payload cost (SUGGESTION only); (b) the simplified routing test replaces a scenario blocked by a reproduced, confirmed jsdom+undici environment bug — not an app defect — and the replacement still covers the spec's actual wording. Zero CRITICAL or WARNING issues found. Ready for `sdd-archive`.

---

### Post-verify fixes (follow-up sdd-apply pass)

All 4 SUGGESTIONs resolved on branch `salesops-mvp`, 3 work-unit commits (no PR, per instructions):

1. **catalog.json duplication** — `1333d50`/`8613075`: relocated `catalog.json` from `public/catalog/appliances/` into `app/data/catalog.json` (single source, bundled by Vite only). Product images (`hero.jpg` + 99 product images) remain under `public/catalog/appliances/**`, untouched. Verified via clean build: `find build/client -iname "catalog.json"` returns nothing; `build/client/catalog/appliances/` still contains 100 image files; `build/client/index.html` still prerenders "Bienvenido al Sales Ops Cockpit" and resolves the sample ProductCard's image (`catalog/appliances/products/cafeteras/cafeteras1.jpeg`) to a real file on disk.
2. **vitest coverage `build/**` exclude** — `8905843`: `vitest.config.ts` now spreads `coverageConfigDefaults.exclude` (preserving vitest's built-in ignores) plus `build/**` and `.react-router/**`, instead of replacing the exclude list outright.
3. **root.tsx ErrorBoundary untested** — `1333d50`: added `app/__tests__/root.test.tsx` coverage for `isRouteErrorResponse` 404 and non-404 branches, a thrown-`Error`-in-DEV branch (message + stack `<pre>`), and a non-Error thrown-value fallback branch. Rendered `ErrorBoundary` directly via RTL (not through `createRoutesStub` + a throwing `loader`, which was tried first and hit the same jsdom+undici `AbortSignal` incompatibility already documented for `routes.test.tsx`).
4. **root.test.tsx type-only assertion** — `1333d50`: the `App` test now asserts `element.type === Outlet` (the real `Outlet` reference from `react-router`) instead of `expect(element).not.toBeNull()`.

**Evidence (fresh run, this pass)**: `pnpm --filter salesops-mvp test` → 4 files, 19/19 passed. `pnpm --filter salesops-mvp typecheck` → zero errors. `rm -rf build && pnpm --filter salesops-mvp build` → succeeds; no `catalog.json` anywhere under `build/client`.

**Known minor deviation**: commit `1333d50` (test-only work unit) incidentally carries the zero-diff `catalog.json` file rename (an artifact of `git mv` staging before the commit split), so `app/data/catalog.ts`'s import isn't repointed until commit `8613075`. Both commits are local/unpushed on this branch; no functional window was ever pushed or reviewed in a broken state. Full test/typecheck/build suite is green as of the final commit (`8905843`).
