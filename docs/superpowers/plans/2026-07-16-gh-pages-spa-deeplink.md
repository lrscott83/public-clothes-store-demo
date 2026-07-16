# GitHub Pages SPA Deep-Link Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deep links and refreshes to client-side routes (e.g. `/public-clothes-store-demo/salesops/decisiones`) resolve to the correct app instead of GitHub's generic 404.

**Architecture:** Emit a single site-root `dist-pages/404.html` that encodes the requested path into a query and redirects to the owning app's `index.html`; inject a decode snippet into each app's `index.html` that restores the real URL via `history.replaceState` before react-router hydrates. The redirect/restore logic lives in pure, unit-tested functions whose source is embedded into the generated HTML, so the shipped browser code is exactly what the tests exercise.

**Tech Stack:** Node ESM build script (`scripts/build-pages-site.mjs`), `node:test` + `node:assert/strict` (zero new dependencies), react-router v7 SPA mode.

## Global Constraints

- No new npm dependencies. Tests use the built-in `node:test` runner only.
- `pathSegmentsToKeep` = repo-base segment count + 1 (repo + app folder). For `REPO_BASE=/public-clothes-store-demo` this is `2`. Compute it, do not hardcode.
- Query strings must survive the round trip: encode `&` as `~and~`.
- The decode snippet must be a plain inline `<script>` inside `<head>` so it runs before the deferred react-router module scripts.
- Pure functions are named function declarations (so `.toString()` yields callable named sources for embedding).
- Commit messages: conventional commits, no AI attribution.

---

### Task 1: Pure path encode/decode functions

**Files:**
- Create: `scripts/spa-redirect.mjs`
- Test: `scripts/spa-redirect.test.mjs`
- Modify: `package.json` (root — add `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pathToRedirect(location, segmentsToKeep) → string | null` — `location` is a `{ protocol, hostname, port, pathname, search, hash }` shape. Returns the encoded redirect URL, or `null` when the path is at/above the kept-segments root and there is no query.
  - `redirectToPath(location) → string | null` — returns the reconstructed real path, or `null` when `search` does not begin with the `/` marker.

- [ ] **Step 1: Add the root `test` script**

Modify `package.json` (root) — add to `"scripts"`:

```json
    "test": "node --test scripts/*.test.mjs"
```

- [ ] **Step 2: Write the failing tests**

Create `scripts/spa-redirect.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToRedirect, redirectToPath } from './spa-redirect.mjs';

const base = { protocol: 'https:', hostname: 'lrscott83.github.io', port: '', hash: '' };
const loc = (pathname, search = '', hash = '') => ({ ...base, pathname, search, hash });

test('pathToRedirect encodes a deep route into the query', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones'), 2);
  assert.equal(out, 'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones');
});

test('pathToRedirect encodes a nested deep route', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/catalog/x'), 2);
  assert.equal(out, 'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/catalog/x');
});

test('pathToRedirect preserves an existing query string as ~and~', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones', '?foo=1&bar=2'), 2);
  assert.equal(
    out,
    'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones&foo=1~and~bar=2',
  );
});

test('pathToRedirect preserves a hash', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones', '', '#section'), 2);
  assert.equal(
    out,
    'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones#section',
  );
});

test('pathToRedirect returns null at the kept-segments root', () => {
  assert.equal(pathToRedirect(loc('/public-clothes-store-demo/salesops/'), 2), null);
});

test('redirectToPath reconstructs the real path from the marker', () => {
  const out = redirectToPath(loc('/public-clothes-store-demo/salesops/', '?/decisiones'));
  assert.equal(out, '/public-clothes-store-demo/salesops/decisiones');
});

test('redirectToPath decodes ~and~ back to &', () => {
  const out = redirectToPath(loc('/public-clothes-store-demo/salesops/', '?/decisiones&foo=1~and~bar=2'));
  assert.equal(out, '/public-clothes-store-demo/salesops/decisiones?foo=1&bar=2');
});

test('redirectToPath returns null with no marker', () => {
  assert.equal(redirectToPath(loc('/public-clothes-store-demo/salesops/', '?foo=1')), null);
});

test('round trip recovers the original path', () => {
  const original = '/public-clothes-store-demo/salesops/catalog/x';
  const encoded = pathToRedirect(loc(original), 2);
  const u = new URL(encoded);
  const restored = redirectToPath({ ...base, pathname: u.pathname, search: u.search, hash: u.hash });
  assert.equal(restored, original);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test scripts/spa-redirect.test.mjs`
Expected: FAIL — cannot resolve module `./spa-redirect.mjs` (file does not exist yet).

- [ ] **Step 4: Write the minimal implementation**

Create `scripts/spa-redirect.mjs`:

```js
// Pure redirect helpers for hosting react-router SPA apps on GitHub Pages.
// The same source runs in two places: imported here for unit tests, and
// embedded verbatim (via .toString()) into the generated static HTML. Keep
// them as named function declarations with no external references.

export function pathToRedirect(loc, segmentsToKeep) {
  const keptRoot = loc.pathname.split('/').slice(0, 1 + segmentsToKeep).join('/');
  const rest = loc.pathname.slice(1).split('/').slice(segmentsToKeep).join('/');
  if (!rest && !loc.search) return null;
  const origin = loc.protocol + '//' + loc.hostname + (loc.port ? ':' + loc.port : '');
  return (
    origin +
    keptRoot +
    '/?/' +
    rest.replace(/&/g, '~and~') +
    (loc.search ? '&' + loc.search.slice(1).replace(/&/g, '~and~') : '') +
    loc.hash
  );
}

export function redirectToPath(loc) {
  if (loc.search[1] !== '/') return null;
  const decoded = loc.search
    .slice(1)
    .split('&')
    .map(function (s) {
      return s.replace(/~and~/g, '&');
    })
    .join('?');
  return loc.pathname.slice(0, -1) + decoded + loc.hash;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test scripts/spa-redirect.test.mjs`
Expected: PASS — 9 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/spa-redirect.mjs scripts/spa-redirect.test.mjs package.json
git commit -m "feat(salesops-mvp): add pure SPA path redirect helpers for GitHub Pages"
```

---

### Task 2: HTML render + inject helpers

**Files:**
- Modify: `scripts/spa-redirect.mjs`
- Modify: `scripts/spa-redirect.test.mjs`

**Interfaces:**
- Consumes: `pathToRedirect`, `redirectToPath` (their `.toString()` sources) from Task 1.
- Produces:
  - `render404Html(redirectFnSource, segmentsToKeep, homeUrl) → string` — full site-root `404.html` document. `redirectFnSource` is `pathToRedirect.toString()`.
  - `injectDecodeSnippet(html, decodeFnSource) → string` — returns `html` with an inline decode `<script>` inserted immediately after `<head>`. `decodeFnSource` is `redirectToPath.toString()`. Throws if `html` has no `<head>`.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/spa-redirect.test.mjs`:

```js
import { render404Html, injectDecodeSnippet } from './spa-redirect.mjs';

test('render404Html embeds the redirect fn, segment count, and home link', () => {
  const html = render404Html('function pathToRedirect(){return null;}', 2, '/public-clothes-store-demo/salesops/');
  assert.match(html, /function pathToRedirect\(\)\{return null;\}/);
  assert.match(html, /pathToRedirect\(window\.location,2\)/);
  assert.match(html, /href="\/public-clothes-store-demo\/salesops\/"/);
  assert.match(html, /window\.location\.replace/);
});

test('injectDecodeSnippet inserts the decode script right after <head>', () => {
  const out = injectDecodeSnippet('<html><head><meta charset="utf-8"></head><body></body></html>', 'function redirectToPath(){return null;}');
  assert.ok(out.startsWith('<html><head><script>'), 'script must follow <head>');
  assert.match(out, /function redirectToPath\(\)\{return null;\}/);
  assert.match(out, /history\.replaceState/);
  assert.match(out, /<meta charset="utf-8">/); // original head content preserved
});

test('injectDecodeSnippet throws when there is no <head>', () => {
  assert.throws(() => injectDecodeSnippet('<html><body></body></html>', 'fn'), /<head>/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test scripts/spa-redirect.test.mjs`
Expected: FAIL — `render404Html` / `injectDecodeSnippet` are not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/spa-redirect.mjs`:

```js
export function render404Html(redirectFnSource, segmentsToKeep, homeUrl) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Redirecting…</title>
<script>(function(){${redirectFnSource}var t=pathToRedirect(window.location,${segmentsToKeep});if(t){window.location.replace(t);}})();</script>
</head>
<body>
<p>If you are not redirected, <a href="${homeUrl}">go to the home page</a>.</p>
</body>
</html>
`;
}

export function injectDecodeSnippet(html, decodeFnSource) {
  if (!html.includes('<head>')) {
    throw new Error('Cannot inject decode snippet: no <head> in HTML.');
  }
  const script =
    '<script>(function(){' +
    decodeFnSource +
    'var p=redirectToPath(window.location);if(p){window.history.replaceState(null,null,p);}})();</script>';
  return html.replace('<head>', '<head>' + script);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test scripts/spa-redirect.test.mjs`
Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/spa-redirect.mjs scripts/spa-redirect.test.mjs
git commit -m "feat(salesops-mvp): add 404 render and index decode-snippet injectors"
```

---

### Task 3: Wire helpers into the pages build

**Files:**
- Modify: `scripts/build-pages-site.mjs`

**Interfaces:**
- Consumes: `pathToRedirect`, `redirectToPath`, `render404Html`, `injectDecodeSnippet` from Tasks 1–2.
- Produces: `dist-pages/404.html` (site-root fallback) and a decode snippet in every `dist-pages/<folder>/index.html`.

- [ ] **Step 1: Import the helpers**

In `scripts/build-pages-site.mjs`, add `readFileSync` to the existing `node:fs` import and import the helpers. The `node:fs` import currently reads:

```js
import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  mkdirSync,
  cpSync,
  writeFileSync,
} from 'node:fs';
```

Replace it with:

```js
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  mkdirSync,
  cpSync,
  writeFileSync,
} from 'node:fs';
import {
  pathToRedirect,
  redirectToPath,
  render404Html,
  injectDecodeSnippet,
} from './spa-redirect.mjs';
```

- [ ] **Step 2: Inject the decode snippet into each app's index.html**

In the `for (const { folder, app, vertical } of TARGETS)` loop, the last statements are:

```js
  cpSync(clientDir, join(outDir, folder), { recursive: true });
  console.log(`[build-pages-site] ${folder} -> ${join(outDir, folder)}`);
}
```

Replace them with:

```js
  cpSync(clientDir, join(outDir, folder), { recursive: true });

  // Deep links arrive here via the root 404.html redirect as `…/?/route`.
  // Restore the real URL before react-router hydrates so it renders the route.
  const indexPath = join(outDir, folder, 'index.html');
  const indexHtml = readFileSync(indexPath, 'utf8');
  writeFileSync(indexPath, injectDecodeSnippet(indexHtml, redirectToPath.toString()));

  console.log(`[build-pages-site] ${folder} -> ${join(outDir, folder)}`);
}
```

- [ ] **Step 3: Emit the site-root 404.html**

Immediately after the `for` loop closes (before the `// --- Root redirect ---` block), add:

```js
// --- Root 404 fallback -------------------------------------------------------
// GitHub Pages serves ONLY the site-root 404.html for not-found paths (verified
// live: per-directory 404.html is never used as a fallback). This catches every
// deep link site-wide and redirects it into the owning app with the requested
// route encoded in the query, where the app's index.html decode snippet
// restores it. pathSegmentsToKeep = repo segment(s) + the app folder.
const pathSegmentsToKeep = REPO_BASE.split('/').filter(Boolean).length + 1;
writeFileSync(
  join(outDir, '404.html'),
  render404Html(pathToRedirect.toString(), pathSegmentsToKeep, `${REPO_BASE}/`),
);
console.log(`[build-pages-site] Root 404.html (pathSegmentsToKeep=${pathSegmentsToKeep})`);
```

- [ ] **Step 4: Run the build and verify the output**

Run: `npm run build:pages`
Expected: build completes; console shows `Root 404.html (pathSegmentsToKeep=2)`.

Then verify the generated artifacts:

Run: `node --test scripts/spa-redirect.test.mjs && test -f dist-pages/404.html && grep -q 'pathToRedirect(window.location,2)' dist-pages/404.html && grep -q 'redirectToPath(window.location)' dist-pages/salesops/index.html && echo OK`
Expected: `OK` — unit tests pass, root 404 exists with the redirect call, and the salesops index carries the decode snippet.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-pages-site.mjs
git commit -m "feat(salesops-mvp): emit root 404 redirect and inject SPA decode into app indexes"
```

---

## Self-Review

**Spec coverage:**
- Root `404.html` with rafgraph redirect → Task 3 Step 3 + Task 2 `render404Html`. ✓
- Decode snippet in each app `index.html` → Task 3 Step 2 + Task 2 `injectDecodeSnippet`. ✓
- `pathToRedirect` / `redirectToPath` pure functions → Task 1. ✓
- `pathSegmentsToKeep = 2` computed, not hardcoded → Task 3 Step 3. ✓
- `&` ↔ `~and~` encoding → Task 1 (tests + impl). ✓
- node:test, zero new deps → Task 1 Step 1. ✓
- Edge cases (null at root, no marker, scripting-off visible link) → Task 1 tests + `render404Html` body link. ✓
- Round-trip test → Task 1 Step 2. ✓
- Option A (redirect to index.html, inject into index.html only) → Task 3 Step 2. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases" — every step carries concrete code or an exact command. ✓

**Type consistency:** `pathToRedirect(location, segmentsToKeep)`, `redirectToPath(location)`, `render404Html(redirectFnSource, segmentsToKeep, homeUrl)`, `injectDecodeSnippet(html, decodeFnSource)` — names and arities are identical across the plan and the design doc. ✓
