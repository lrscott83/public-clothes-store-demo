#!/usr/bin/env node
/**
 * Builds every storefront vertical into its own GitHub Pages subpath folder.
 *
 * GitHub Pages serves this repo's project page at `/<repo>/`. To host two
 * independent storefronts side by side we build each vertical twice-over with:
 *
 *   - VITE_BASE           = `/<repo>/<folder>/`  (asset base + router basename)
 *   - VITE_STORE_VERTICAL = the vertical key from app/store/verticals.ts
 *
 * and collect each build's `build/client` output under `dist-pages/<folder>`.
 * The resulting `dist-pages/` is what you publish to the `gh-pages` branch
 * root, so the final URLs are:
 *
 *   https://<user>.github.io/<repo>/clothes/
 *   https://<user>.github.io/<repo>/appliances/
 *
 * Run:     node scripts/build-pages-verticals.mjs
 * Publish: npx gh-pages -d dist-pages
 */
import { execSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Config -----------------------------------------------------------------

// The GitHub Pages project subpath (the repo name). Override with REPO_BASE=...
const REPO_BASE = (process.env.REPO_BASE || '/public-clothes-store-demo').replace(/\/$/, '');

// Each target: `folder` is the URL subpath (and output dir); `vertical` is the
// VITE_STORE_VERTICAL key registered in app/store/verticals.ts. Keep `folder`
// equal to `vertical` so the served URL matches the vertical name.
const TARGETS = [
  { folder: 'clothes', vertical: 'clothes' },
  { folder: 'appliances', vertical: 'appliances' },
];

// The repo root (`/<repo>/`) has no app of its own, so it 404s unless we drop a
// redirect there. Point it at one of the TARGETS' folders (must match a
// `folder` above). Set to `null` to skip generating the root index.
const ROOT_REDIRECT_TO = 'appliances';

// --- Paths ------------------------------------------------------------------

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // static-store root
const clientDir = join(appDir, 'build', 'client');
const outDir = join(appDir, 'dist-pages');
// Ensure the locally-installed react-router bin resolves regardless of the
// package manager the caller uses.
const binDir = join(appDir, 'node_modules', '.bin');

// --- Build ------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const { folder, vertical } of TARGETS) {
  const base = `${REPO_BASE}/${folder}/`;
  console.log(`\n=== Building "${folder}"  (vertical=${vertical}, base=${base}) ===`);

  const env = {
    ...process.env,
    VITE_BASE: base,
    VITE_STORE_VERTICAL: vertical,
    PATH: `${binDir}:${process.env.PATH || ''}`,
  };

  // Clean the previous vertical's output so nothing leaks between builds.
  rmSync(join(appDir, 'build'), { recursive: true, force: true });

  execSync('react-router build', { cwd: appDir, env, stdio: 'inherit' });
  execSync('node scripts/prepare-pages-build.mjs', { cwd: appDir, env, stdio: 'inherit' });

  if (!existsSync(clientDir)) {
    throw new Error(`Expected build output at ${clientDir} but it is missing.`);
  }

  const dest = join(outDir, folder);
  cpSync(clientDir, dest, { recursive: true });

  // prepare-pages-build flattens the leaf subpath but leaves the empty parent
  // dir behind (e.g. `<repo>/`). Prune it so the published tree is clean.
  const repoSegment = REPO_BASE.replace(/^\//, '').split('/')[0];
  if (repoSegment) rmSync(join(dest, repoSegment), { recursive: true, force: true });

  console.log(`[build-pages-verticals] ${folder} -> ${dest}`);
}

// Root redirect: `/<repo>/` -> `/<repo>/<folder>/`. Uses meta-refresh + a JS
// fallback + a visible link so it works with or without scripting.
if (ROOT_REDIRECT_TO) {
  if (!TARGETS.some((t) => t.folder === ROOT_REDIRECT_TO)) {
    throw new Error(`ROOT_REDIRECT_TO "${ROOT_REDIRECT_TO}" is not one of the built folders.`);
  }
  const target = `${REPO_BASE}/${ROOT_REDIRECT_TO}/`;
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <link rel="canonical" href="${target}" />
    <title>Redirecting…</title>
    <script>window.location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <p>Redirecting to <a href="${target}">${target}</a>…</p>
  </body>
</html>
`;
  writeFileSync(join(outDir, 'index.html'), html);
  console.log(`[build-pages-verticals] Root index.html -> ${target}`);
}

console.log(`\nDone. Two folders generated under: ${outDir}`);
console.log(`Publish both at once with:\n  npx gh-pages -d dist-pages\n`);
