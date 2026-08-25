# store-mgmt-template — monorepo

A pnpm + Turborepo workspace that hosts two independent static React apps and
the shared packages they build on. Both apps ship as **client-only SPAs** (no
server runtime) and are published side by side to **GitHub Pages**.

> **Where this lives:** this monorepo is the `templates/` directory of the
> `public-clothes-store-demo` repo. The GitHub Pages deploy is orchestrated
> from the **repo root** (one level up) — see [Publish to GitHub Pages](#publish-to-github-pages).

## Quick path

```bash
# from templates/  (this directory)
pnpm install                                   # Node >= 22, pnpm 10
pnpm --filter @store-mgmt/salesops-mvp dev     # Sales Ops Cockpit -> http://localhost:3355
pnpm --filter @store-mgmt/static-store dev     # Storefront       -> http://localhost:3344
```

## Run the local sales catalog stack

The admin catalog (`web-catalog`) is NOT a static SPA — it needs three NestJS
APIs and a Postgres 17 database. Everything is wired through gitignored
per-app `.env` files (ports, shared JWT secret, storage path), so once those
exist the whole stack starts with ONE command.

### One-time setup

Prerequisite: a local **Postgres 17** listening on port `5433` (no
docker-compose in this repo — the dev DB is a locally installed service).
Create the databases/store first if needed, then:

```bash
# from templates/
pnpm install
pnpm --filter @store-mgmt/infra-db prisma:generate
pnpm --filter @store-mgmt/infra-db prisma:migrate:deploy   # apply migrations
pnpm build                                                  # seeds consume built dist/
pnpm --filter @store-mgmt/infra-db seed                     # demo data + users
```

Skip migrate/seed if the database is already populated.

### Start everything (Option A — single command)

```bash
# from templates/
pnpm dev:local    # turbo runs all four apps in parallel:
                  #   api-idp       -> http://localhost:4902  (auth / JWT)
                  #   api-salesops  -> http://localhost:4901  (admin API: products, imports, images)
                  #   api-public    -> http://localhost:4903  (public image serving)
                  #   web-catalog   -> console (pick a port, e.g. --port 3900)
```

Then open the web console and log in with a seeded cockpit account
(dev-only password shared by every seeded account):

| Login | Role | Password |
|-------|------|----------|
| `owner` | Dueño | `DevPass123!` |
| `admin` | Administrador | `DevPass123!` |

> The APIs' ports and secrets come from each app's gitignored `.env`
> (`api-idp`, `api-salesops`, `api-public`, `web-catalog`). If an app fails to
> boot complaining about env vars or the DB, check those files first.

Verify everything before pushing:

```bash
pnpm check      # build + lint + typecheck + test, across the whole workspace
```

## What's inside

### Apps (`apps/*`)

| App | Package | Dev port | What it is |
|-----|---------|----------|------------|
| Sales Ops Cockpit | `@store-mgmt/salesops-mvp` | 3355 | The sales-operations dashboard (finance, decisions, inventory, orders, FX). Deployed as the default Pages landing. |
| Storefront | `@store-mgmt/static-store` | 3344 | A themeable storefront built once per **vertical** (`clothes`, `appliances`, `demo`). See its own [README](apps/static-store/README.md). |
| Admin Catalog | `@store-mgmt/web-catalog` | free (e.g. 3900) | Server-side admin console for the live catalog stack — needs the three APIs below and Postgres. See [Run the local sales catalog stack](#run-the-local-sales-catalog-stack). |
| Identity API | `@store-mgmt/api-idp` | 4902 | NestJS auth service: login, JWT issue/refresh. |
| Sales Ops API | `@store-mgmt/api-salesops` | 4901 | NestJS tenant-scoped admin API: products, categories, bulk CSV import, image upload. |
| Public API | `@store-mgmt/api-public` | 4903 | NestJS public API serving catalog images from the shared storage volume. |

### Packages (`packages/*`)

| Package | Role |
|---------|------|
| `@store-mgmt/storefront` | Vertical-agnostic storefront library (config resolution, theme, baked-catalog provider). Apps choose the vertical; the library never does. |
| `@store-mgmt/domain` | Framework-free business logic and types. |
| `@store-mgmt/web-common` | Shared React/UI building blocks. |
| `@store-mgmt/eslint-config` | Shared ESLint config. |
| `@store-mgmt/typescript-config` | Shared `tsconfig` bases. |

## Everyday commands

Run from `templates/`. Turborepo fans each task out across the workspace and caches results.

| Command | Does |
|---------|------|
| `pnpm dev` | Build deps, then run every app's dev server. |
| `pnpm build` | Production build of every app and package. |
| `pnpm test` | Vitest across the workspace. |
| `pnpm lint` / `pnpm typecheck` | Lint / typecheck across the workspace. |
| `pnpm check` | `build + lint + typecheck + test` — the full gate. |
| `pnpm format` | Prettier over `**/*.{ts,tsx,md}`. |
| `pnpm clean` | Remove build outputs and caches. |

Scope any command to one package with `--filter`, e.g. `pnpm --filter @store-mgmt/salesops-mvp test`.

## Publish to GitHub Pages

The site serves all apps under one repo project page:

```
https://<user>.github.io/<repo>/            -> redirects to /<repo>/salesops/
https://<user>.github.io/<repo>/salesops/    -> Sales Ops Cockpit  (default)
https://<user>.github.io/<repo>/clothes/     -> storefront (clothes vertical)
https://<user>.github.io/<repo>/appliances/  -> storefront (appliances vertical)
```

### Deploy (one command)

```bash
# from the REPO ROOT (parent of this monorepo), not from templates/
npm run deploy:pages
```

That runs `scripts/build-pages-site.mjs` (build + assemble) and pushes the
result to the `gh-pages` branch with `gh-pages -d dist-pages --dotfiles`.
GitHub rebuilds the Pages site within ~1 minute.

To build without publishing (inspect `dist-pages/` first):

```bash
npm run build:pages     # from the repo root
```

### One-time setup (per fork)

| Step | Where |
|------|-------|
| Set the Pages source to **branch `gh-pages`, folder `/ (root)`** | Repo → Settings → Pages → "Deploy from a branch" |
| Point `REPO_BASE` at your repo name if it differs from `public-clothes-store-demo` | env var, or edit `scripts/build-pages-site.mjs` |

### How the build works

`scripts/build-pages-site.mjs` builds each target under its own URL subpath and
collects them into a single `dist-pages/` tree:

1. For each target, build with `VITE_BASE=/<repo>/<folder>/` (the storefront
   also gets `VITE_STORE_VERTICAL`). `VITE_BASE` sets both Vite's asset base and
   the React Router `basename`, so links and assets resolve under the subpath.
2. **Flatten** the prerenderer's basename-nested HTML (`<repo>/<folder>/index.html`)
   back up to the folder root — GitHub Pages prepends `/<repo>/` by repo name,
   not by on-disk folders.
3. **Rename** the SPA fallback shell to `404.html` so deep links to client-only
   routes resolve (Pages has no server rewrites).
4. Write the root `index.html` redirect to `ROOT_REDIRECT_TO` and a `.nojekyll`.

> `gh-pages` replaces the whole branch on publish, so **every** app must be in
> `dist-pages/` on each deploy — that is why the orchestrator rebuilds all
> three. There is also a storefront-only subset (`pnpm build:pages:all` inside
> this monorepo) that builds `clothes` + `appliances` without the cockpit; the
> repo-root `deploy:pages` is the full, canonical path.

### Change what's deployed

Edit the config block at the top of `scripts/build-pages-site.mjs`:

| To… | Change |
|------|--------|
| Change the default landing | `ROOT_REDIRECT_TO` (must match a `folder` in `TARGETS`) |
| Add/remove an app or vertical | the `TARGETS` array (`folder`, `app`, optional `vertical`) |
| Deploy under a different repo name | `REPO_BASE` |

## Checklist before deploying

- [ ] `pnpm check` passes from `templates/`.
- [ ] Pages source is set to `gh-pages` / root (one-time).
- [ ] `REPO_BASE` matches your repo name.
- [ ] `npm run deploy:pages` from the repo root prints `Published`.
- [ ] The live `…/salesops/` URL loads the cockpit (not a 404).

## Known caveats

- **Storefront `demo` vertical is not published** — only `clothes` and
  `appliances` are in `TARGETS`. Add it there if you want it online.

## Assets and the base path

Anything served under a Pages subpath must be resolved against the app base, or
it 404s off the domain root. Two rules keep this correct:

- **Fonts / CSS assets**: reference them with a **relative** `url()` (e.g.
  `url('./fonts/inter/inter-400.woff2')` in `packages/web-common/styles.css`) so
  Vite fingerprints them into `assets/` and rewrites the URL with the base. Never
  a leading-slash `url('/fonts/...')`.
- **Catalog images**: resolve through `resolveCatalogImage()`
  (`salesops-mvp/app/data/catalog.ts`), which prefixes `import.meta.env.BASE_URL`.
  Never hardcode a leading-slash `/catalog/...` path.
