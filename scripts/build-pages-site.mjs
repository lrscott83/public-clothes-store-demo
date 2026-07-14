#!/usr/bin/env node
/**
 * Builds every GitHub Pages app in this repo into a single publishable tree and
 * wires the root redirect. This repo hosts more than one static app, so a plain
 * per-app `react-router build` is not enough — each app must be built under its
 * own URL subpath and then collected side by side.
 *
 * GitHub Pages serves this repo's project page at `/<repo>/`. Each target below
 * is built with:
 *
 *   - VITE_BASE           = `/<repo>/<folder>/`  (asset base + router basename)
 *   - VITE_STORE_VERTICAL = the storefront vertical key (storefront app only)
 *
 * and its `build/client` output is collected under `dist-pages/<folder>`. The
 * repo root (`/<repo>/`) has no app of its own, so a redirect `index.html` is
 * dropped there pointing at ROOT_REDIRECT_TO. Final URLs:
 *
 *   https://<user>.github.io/<repo>/           -> redirect to /<repo>/salesops/
 *   https://<user>.github.io/<repo>/salesops/   -> Sales Ops Cockpit
 *   https://<user>.github.io/<repo>/clothes/    -> storefront (clothes vertical)
 *   https://<user>.github.io/<repo>/appliances/ -> storefront (appliances vertical)
 *
 * Run:     node scripts/build-pages-site.mjs
 * Publish: npx gh-pages -d dist-pages
 */
import { execSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
  mkdirSync,
  cpSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Config -----------------------------------------------------------------

// The GitHub Pages project subpath (the repo name). Override with REPO_BASE=...
const REPO_BASE = (process.env.REPO_BASE || '/public-clothes-store-demo').replace(/\/$/, '');
// '/public-clothes-store-demo' -> 'public-clothes-store-demo'
const repoSegment = REPO_BASE.replace(/^\//, '').split('/')[0];

// Each target: `folder` is the URL subpath (and output dir); `app` is the app
// directory under templates/apps; `vertical` (optional) is the
// VITE_STORE_VERTICAL key for the multi-vertical storefront app. Keep `folder`
// equal to the vertical name so the served URL matches the vertical.
const TARGETS = [
  { folder: 'salesops', app: 'salesops-mvp' },
  { folder: 'clothes', app: 'static-store', vertical: 'clothes' },
  { folder: 'appliances', app: 'static-store', vertical: 'appliances' },
];

// The repo root (`/<repo>/`) has no app of its own, so it 404s unless we drop a
// redirect there. Point it at one of the TARGETS' folders (must match a
// `folder` above). Set to `null` to skip generating the root index.
const ROOT_REDIRECT_TO = 'salesops';

// --- Paths ------------------------------------------------------------------

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..'); // repo root
const appsDir = join(rootDir, 'templates', 'apps');
const outDir = join(rootDir, 'dist-pages');

// --- Build ------------------------------------------------------------------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// Disable Jekyll on GitHub Pages so it serves the tree verbatim and never
// strips files/dirs it considers "special" (e.g. leading-underscore names).
writeFileSync(join(outDir, '.nojekyll'), '');

for (const { folder, app, vertical } of TARGETS) {
  const appDir = join(appsDir, app);
  const clientDir = join(appDir, 'build', 'client');
  // Ensure the app's locally-installed react-router bin resolves regardless of
  // the package manager the caller uses.
  const binDir = join(appDir, 'node_modules', '.bin');
  const base = `${REPO_BASE}/${folder}/`;
  console.log(
    `\n=== Building "${folder}"  (app=${app}${vertical ? `, vertical=${vertical}` : ''}, base=${base}) ===`,
  );

  const env = {
    ...process.env,
    VITE_BASE: base,
    PATH: `${binDir}:${process.env.PATH || ''}`,
  };
  if (vertical) env.VITE_STORE_VERTICAL = vertical;

  // Clean the previous target's output so nothing leaks between builds.
  rmSync(join(appDir, 'build'), { recursive: true, force: true });
  execSync('react-router build', { cwd: appDir, env, stdio: 'inherit' });

  if (!existsSync(clientDir)) {
    throw new Error(`Expected build output at ${clientDir} but it is missing.`);
  }

  // --- Prepare for GitHub Pages ---------------------------------------------
  // 1. Flatten basename-nested prerendered HTML. With a non-root VITE_BASE the
  //    prerenderer writes HTML nested on disk under `<repo>/<folder>/` while
  //    emitted assets stay at the build root. GitHub Pages prepends `/<repo>/`
  //    based on the repo name, not on-disk folders, so the HTML must be
  //    flattened back up to the build root to match what Pages serves.
  const trimmedBase = base.replace(/^\/|\/$/g, ''); // e.g. public-clothes-store-demo/salesops
  const nestedDir = join(clientDir, trimmedBase);
  if (existsSync(nestedDir)) {
    for (const entry of readdirSync(nestedDir)) {
      renameSync(join(nestedDir, entry), join(clientDir, entry));
    }
    // Prune the now-empty `<repo>/...` parent tree left behind.
    rmSync(join(clientDir, repoSegment), { recursive: true, force: true });
  }

  // 2. Rename the SPA fallback shell to `404.html`. GitHub Pages has no
  //    server-side rewrites, so deep links to client-only routes 404 unless a
  //    `404.html` SPA shell is served for the client router to take over.
  const fallback = join(clientDir, '__spa-fallback.html');
  if (existsSync(fallback)) {
    renameSync(fallback, join(clientDir, '404.html'));
  }

  cpSync(clientDir, join(outDir, folder), { recursive: true });
  console.log(`[build-pages-site] ${folder} -> ${join(outDir, folder)}`);
}

// --- Root redirect ----------------------------------------------------------
// `/<repo>/` -> `/<repo>/<folder>/`. meta-refresh + JS fallback + visible link
// so it works with or without scripting.
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
  console.log(`[build-pages-site] Root index.html -> ${target}`);
}

console.log(`\nDone. ${TARGETS.length} folders generated under: ${outDir}`);
console.log(`Publish all at once with:\n  npx gh-pages -d dist-pages\n`);
