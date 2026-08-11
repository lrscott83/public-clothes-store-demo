# infra-storage

Puts product image bytes on disk behind `IProductImageStore`
(`packages/domain`, design.md D1). **Phase 0 status**: package.json scaffold
only — `sharp` toolchain proof (spike 0.3). `FsProductImageStore`,
`normalize-image.ts`, and the Nest module land in Phase 2.

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

## Dev

```
pnpm --filter @store-mgmt/infra-storage smoke
```
