// Minimal Node ESM resolver hook, used ONLY by `scripts/tenant-orphan-sweep.ts`.
//
// WHY THIS EXISTS: every file under `src/` writes NodeNext-style relative
// imports (e.g. `./schema-name.js`) even though the file on disk is
// `schema-name.ts` — required so `tsc`'s compiled output (`dist/`) resolves
// correctly at runtime, and already relied on by `jest.config.js`'s own
// `moduleNameMapper` for the exact same reason (`'^(\\.{1,2}/.*)\\.js$': '$1'`).
// Node's native TypeScript type-stripping (the "no build step" mode every
// script in this directory uses) has no equivalent rewrite: a `.js`
// specifier resolves ONLY against a literal `.js` file on disk. Every other
// script here (`verify-order-attribution.ts`, `verify-company-user-backfill.ts`,
// `generate-tenant-schema-sql.ts`) never hit this because none of them import
// a `src/` module that itself has further relative imports — the sweep tool
// does (`tenant-orphan-sweep.ts` imports `schema-name.js` for `schemaNameFor`/
// `assertSchemaName`, design D3's single choke point, not duplicated here).
//
// This hook retries a failed `.js` resolution as `.ts` — nothing else.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith('.js') && err?.code === 'ERR_MODULE_NOT_FOUND') {
      return nextResolve(specifier.replace(/\.js$/, '.ts'), context);
    }
    throw err;
  }
}
