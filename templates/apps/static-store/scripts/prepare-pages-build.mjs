#!/usr/bin/env node
/**
 * Post-processes a `react-router build` output for GitHub Pages deployment.
 *
 * Two things are needed on top of a plain `react-router build`:
 *
 * 1. Flatten basename-nested prerendered HTML.
 *
 *    When `VITE_BASE`/`basename` is a non-root subpath (e.g. `/repo-name/`),
 *    React Router's prerenderer writes prerendered HTML nested under that
 *    subpath ON DISK — `build/client/repo-name/index.html`,
 *    `build/client/repo-name/productos/index.html` — while emitted JS/CSS
 *    (`assets/**`) and static assets (`verticals/**`) stay at the build
 *    root. This matches Vite's own asset-emission model (asset URLs get the
 *    `base` prefix baked into the HTML/JS; physical output location is
 *    `base`-independent).
 *
 *    GitHub Pages *project* pages already prepend `/repo-name/` to every
 *    served URL based on the REPO name (branch root -> `/repo-name/`), not
 *    on-disk folder structure. Publishing `build/client` as-is would put
 *    the HTML at a doubly-nested URL
 *    (`/repo-name/repo-name/index.html`) while assets resolve correctly at
 *    `/repo-name/assets/*` — so the HTML must be flattened back up to the
 *    build root to match what GitHub Pages actually serves.
 *
 * 2. Rename the SPA fallback shell to `404.html`.
 *
 *    GitHub Pages has no server-side rewrites, so any deep-link request for
 *    a client-only route (e.g. `/repo-name/productos/some-id`) 404s unless
 *    GitHub Pages is given a `404.html` to serve instead — React Router's
 *    `__spa-fallback.html` is exactly that SPA shell, so it is renamed to
 *    `404.html` at the publish root. The client-side router then takes over
 *    and renders the correct route.
 */
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const clientDir = join(process.cwd(), 'build', 'client');
const base = process.env.VITE_BASE || '/';
// '/public-clothes-store-demo/' -> 'public-clothes-store-demo'; '/' -> ''
const trimmedBase = base.replace(/^\/|\/$/g, '');

if (trimmedBase) {
  const nestedDir = join(clientDir, trimmedBase);
  if (existsSync(nestedDir)) {
    for (const entry of readdirSync(nestedDir)) {
      renameSync(join(nestedDir, entry), join(clientDir, entry));
    }
    rmSync(nestedDir, { recursive: true, force: true });
    console.log(`[prepare-pages-build] Flattened prerendered HTML from "${trimmedBase}/" up to the build root.`);
  }
}

const fallback = join(clientDir, '__spa-fallback.html');
const notFound = join(clientDir, '404.html');
if (existsSync(fallback)) {
  renameSync(fallback, notFound);
  console.log('[prepare-pages-build] Wrote 404.html from the SPA fallback shell.');
} else {
  console.warn('[prepare-pages-build] __spa-fallback.html not found; skipping 404.html generation.');
}
