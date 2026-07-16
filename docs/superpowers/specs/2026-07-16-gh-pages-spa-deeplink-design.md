# GitHub Pages SPA Deep-Link Fallback — Design

Date: 2026-07-16
Status: Approved (Option A)

## Problem

Deep links and refreshes on the deployed site 404. Example:
`https://lrscott83.github.io/public-clothes-store-demo/salesops/decisiones` → GitHub's
generic "File not found" page.

`salesops` is a react-router v7 app in **SPA mode** (`ssr: false`, `basename` set,
only `/` is prerendered). Client-side routes like `/decisiones` are resolved by
JavaScript in the browser, not by physical files on disk. GitHub Pages has no
server-side rewrites, so a request for a client-only route finds no file and 404s.

### Verified root cause

`scripts/build-pages-site.mjs` renames each app's SPA fallback shell to
`<app>/404.html`, assuming GitHub Pages serves a per-directory `404.html`. That
assumption is **false**, verified live via `curl` on 2026-07-16:

| URL | Result |
| --- | --- |
| `/public-clothes-store-demo/salesops/` | 200 — app loads |
| `/public-clothes-store-demo/salesops/404.html` | 200 — shell exists (3.2 KB) |
| `/public-clothes-store-demo/salesops/decisiones` | 404 — GitHub **generic** page |

The nested `salesops/404.html` exists but is never used as the fallback. GitHub
Pages serves **only the site-root `404.html`** as the custom not-found fallback,
and the build emits no root `404.html`. That is the single point of control.

## Approach

Use the rafgraph "SPA on GitHub Pages" technique, adapted for this multi-app repo:

1. **Root `dist-pages/404.html`** catches every not-found path site-wide. Its
   inline script keeps the first `pathSegmentsToKeep` path segments
   (`/<repo>/<app>/`) and pushes the remainder into a query, then redirects:
   `/repo/salesops/decisiones` → `/repo/salesops/?/decisiones`.
2. **Decode snippet in each app `index.html`** reads that query, reconstructs the
   real URL (`/repo/salesops/decisiones`) via `history.replaceState` **before**
   react-router hydrates, and the client router renders the deep route.

`pathSegmentsToKeep = 2` (repo segment + app folder). Uniform across
`salesops`, `clothes`, and `appliances` — no per-app special casing.

### Option A (chosen)

Redirect deep links to the app's `index.html`, which carries prerendered home
content. A brief flash of the home view may appear before the router paints the
target route. Accepted: this is a demo cockpit, the flash is negligible, and the
change surface is smaller (snippet injected into `index.html` only). Option B
(redirect to the pure `404.html` shell to avoid the flash) is a trivial future
switch if ever needed.

## Components

Two **pure functions** are the testable core. They run in the browser (embedded
via `.toString()`) and in Node (imported by tests) — the same code both places.

### `scripts/spa-redirect.mjs`

- `pathToRedirect(location, segmentsToKeep) → string | null`
  Given a location-like object (`{ protocol, hostname, port, pathname, search,
  hash }`), returns the encoded redirect URL. Returns `null` when there is
  nothing to redirect (path already at or above the kept-segments root).
  Encodes `&` as `~and~` so query strings survive the round trip.
- `redirectToPath(location) → string | null`
  Given a location whose `search` begins with `/` (the `?/` marker), returns the
  reconstructed real path (`pathname` + decoded route + `hash`). Returns `null`
  when there is no marker (nothing to restore).

### `scripts/build-pages-site.mjs` (modified)

- Import both functions.
- After building all targets, write `dist-pages/404.html`: an inline
  `<script>` that embeds `pathToRedirect.toString()`, calls it with
  `window.location` and `pathSegmentsToKeep = 2`, and `window.location.replace`s
  the result when non-null.
- For each app, inject an inline `<head>` `<script>` into its emitted
  `index.html` that embeds `redirectToPath.toString()`, calls it with
  `window.location`, and `history.replaceState`s the result when non-null. The
  script must run before the deferred react-router module scripts.

### `package.json` (root, modified)

- Add `"test": "node --test scripts/*.test.mjs"`.

## Data flow

```
Browser → GET /repo/salesops/decisiones
GitHub Pages → 404 → serves /404.html
  /404.html script: pathToRedirect(location, 2)
    → /repo/salesops/?/decisiones
  location.replace(...)
Browser → GET /repo/salesops/?/decisiones
GitHub Pages → 200 → serves /salesops/index.html
  index.html head script: redirectToPath(location)
    → /repo/salesops/decisiones
  history.replaceState(...)  (URL fixed, no reload)
react-router hydrates against /decisiones → renders Decisiones
```

## Error handling / edge cases

- **No redirect needed:** `pathToRedirect` returns `null` when the path has no
  segments beyond the kept root; the 404 script does nothing (falls through to a
  visible link — see below).
- **No marker to decode:** `redirectToPath` returns `null` when `search` does not
  start with `/`; the index snippet is a no-op on normal loads.
- **Scripting disabled:** the root `404.html` also renders a visible
  `<noscript>`-safe link to the site root so it is not a dead end.
- **Query strings & hashes:** preserved via `~and~` encoding and round-tripped.

## Testing (TDD, node:test, zero new deps)

Tests in `scripts/spa-redirect.test.mjs`, written **before** the implementation:

- `pathToRedirect`
  - deep route → `/repo/salesops/?/decisiones`
  - nested deep route (`/repo/salesops/catalog/x`) → `/repo/salesops/?/catalog/x`
  - preserves an existing query string (`&` → `~and~`)
  - preserves a hash
  - returns `null` at the kept-segments root
- `redirectToPath`
  - `?/decisiones` marker → reconstructed `/repo/salesops/decisiones`
  - decodes `~and~` back to `&`
  - returns `null` with no `?/` marker
- **Round trip:** `redirectToPath` composed with `pathToRedirect` recovers the
  original path for representative inputs.

The functions are exercised in Node; the browser embeds their exact source, so
green tests certify the shipped code.

## Out of scope

- Removing the now-unused per-app `<app>/404.html` files (harmless; left as-is).
- Switching to `HashRouter`.
- Option B (flash-free redirect to the pure shell).
