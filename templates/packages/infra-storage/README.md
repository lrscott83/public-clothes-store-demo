# infra-storage

Puts product/category image bytes on disk behind `IImageStore`
(`packages/domain`, design.md D1). `FsImageStore` (put/open/delete,
`src/image/fs-image.store.ts`) and `normalize-image.ts`
(EXIF-rotate → resize → webp, the only file that imports `sharp`) have
landed. This doc also records the two proofs task 2.5 and 2.6 require: that
bytes survive a process restart under a fixed `STORAGE_PATH`, and the
explicit, declared boundary of what that does and does not establish.

## Spike 0.3 — does `sharp` install and run in this pnpm/turbo workspace?

**Result: PASS.**

```
$ pnpm --filter @store-mgmt/infra-storage add sharp
+ sharp 0.35.3

$ pnpm --filter @store-mgmt/infra-storage smoke
PASS: sharp decode -> rotate -> resize -> webp round trip produced 44 bytes of valid WebP.
```

`scripts/sharp-smoke.mjs` runs the exact operation chain Phase 2's
`normalize-image.ts` will use — `.rotate()` → `.resize({width:1600,
withoutEnlargement:true})` → `.webp({quality:82})` — against a tiny in-memory
raw RGB buffer (no fixture file needed) and asserts the output is a
non-empty, valid WebP buffer.

### Install size and behaviour

| Package | Size on disk |
|---|---|
| `sharp@0.35.3` | 988 KB |
| `@img/sharp-linux-x64@0.35.3` (native binding) | 456 KB |
| `@img/sharp-libvips-linux-x64@1.3.2` (prebuilt libvips binary) | 18 MB |
| `@img/colour@1.1.0` | 108 KB |
| **Total** | **~19 MB** |

- Installed cleanly via `pnpm add` inside this nested-template workspace —
  no build-from-source step, no native compiler needed; `pnpm`'s
  `onlyBuiltDependencies` allowlist (`pnpm-workspace.yaml`) didn't need a new
  entry because `sharp` ships a prebuilt binary for this platform
  (`linux-x64`) rather than running a `node-gyp` install script.
- The bulk of the install size is the prebuilt `libvips` binary
  (`@img/sharp-libvips-linux-x64`), not JS — expected for a native image
  library, and a one-time cost per platform target, not per build.
- No warnings, no peer-dependency conflicts, no postinstall failures.

## `STORAGE_PATH` — where product image bytes actually live

`FsImageStore` resolves every ref under `<STORAGE_PATH>/<companyId>/<ref>`
(`src/image/fs-image.store.ts`). `STORAGE_PATH` is read once,
at construction:

```ts
function defaultStoragePath(): string {
  return process.env.STORAGE_PATH ?? resolve(process.cwd(), 'storage');
}
```

| Environment | `STORAGE_PATH` requirement |
|---|---|
| Local dev | Optional — defaults to `<app cwd>/storage`. Fine for a throwaway dev machine. |
| Any real deployment | **Required**, and it MUST point at a mounted volume. Without a volume, a container recreate (redeploy, restart, autoscale replace) wipes every uploaded image — the filesystem is ephemeral, the `Product.image` DB row is not, and the two silently disagree the instant the container is replaced. |

Both `apps/api-salesops` (writer, Phase 3) and `apps/api-public` (reader,
Phase 4) must be given the **same** `STORAGE_PATH`, pointed at the **same**
volume, or a shopper-facing `404`/`PRODUCT_IMAGE_MISSING` (design.md D6) is
the guaranteed outcome for every image the writer app produces.

## Task 2.5 — process-restart persistence proof: PASS

**Claim proven**: a file written through `FsImageStore.put()` under a
FIXED `STORAGE_PATH` (never a `tmpdir`/`mkdtemp` path, unlike every other spec
in this package) is still readable via `open()` after the writing process has
fully died and a brand-new, unrelated process has started.

**How**: `src/image/restart-proof.spec.ts` spawns two independent
`node` OS processes via `execFileSync` — `scripts/restart-proof-write.js`
(writes, then exits; the parent blocks until it has genuinely terminated) and
only THEN `scripts/restart-proof-read.js` (a second process, no shared memory
or module cache with the first). Both run against `dist/`, the same compiled
artifact `api-salesops`/`api-public` actually import — not the raw `.ts`
source ts-jest transforms in-process for every other spec here.

```
$ pnpm --filter @store-mgmt/infra-storage test -- restart-proof
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

The fixed path used is `packages/infra-storage/.storage-restart-proof/`
(gitignored, `templates/.gitignore`) and is removed by the spec's
`beforeEach`/`afterAll` hooks — the proof leaves no stray files in the repo
even on a failed run.

### What this proves — and what it does NOT

| Claim | Status |
|---|---|
| Bytes outlive the **writing process** on the same host/filesystem | **Proven** — this is the mechanism `api-salesops` (writer) and `api-public` (reader), two separate Node processes today and two separate containers in any real deployment, actually depend on. |
| Bytes outlive a **container restart/recreate** | **NOT proven here.** That requires the container's filesystem itself to be backed by a mounted volume at `STORAGE_PATH` — see task 2.6 below. A process restart on the same disk is a necessary but not sufficient stand-in for a container restart; the two are only equivalent when a volume is actually mounted. |

## Task 2.6 — container-volume-mount proof: explicitly out of scope

Not silently dropped — recorded here as a declared gap. The full proof (a
`docker-compose` service definition mounting a volume at `STORAGE_PATH` for
`api-public`/`api-salesops`/`web-catalog`, then killing and recreating the
container to prove the volume — not just the process — survives) is **not**
implemented in this repo today:

- No `docker-compose` file wires `api-public`, `api-salesops`, or
  `web-catalog` anywhere in this repository.
- design.md §4's file map does not name one either.

Task 2.5's process-restart proof covers the mechanism the feature depends on
— a stable path that outlives the process writing to it. Actual container
deployment configuration (the compose/orchestration file, the volume
definition, wiring `STORAGE_PATH` identically into both the writer and reader
apps) is a follow-up **if and when a real deployment target is defined** for
this repo. Until then, deploying this feature without a mounted volume at
`STORAGE_PATH` is a known, declared risk: a container recreate silently
discards every uploaded product image while the `Product.image` DB rows keep
pointing at refs that no longer exist on disk.

## Dev

```
pnpm --filter @store-mgmt/infra-storage smoke
pnpm --filter @store-mgmt/infra-storage test
```
