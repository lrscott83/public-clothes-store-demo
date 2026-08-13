#!/usr/bin/env node
'use strict';

// Task 2.5 / spike 0.5 — half of the process-restart proof.
//
// Spawned by `restart-proof.spec.ts` as its OWN `node` process, never
// `require`d in-process, so that when it exits, the process that called
// `FsImageStore.put()` is genuinely gone — not just "the function
// returned". The companion `restart-proof-read.js` runs afterwards as a
// SECOND, unrelated process.
//
// Requires the compiled `dist/` output (same artifact `api-salesops` and
// `api-public` will actually import), not the raw `.ts` source — the caller
// rebuilds `dist/` before spawning this script.
const { FsImageStore } = require('../dist/image/fs-image.store.js');

// Fixed literal, not a fixture file: the read side asserts against this
// exact byte sequence.
const PAYLOAD = Buffer.from('spike-0.5-restart-proof-payload', 'utf8');

async function main() {
  const [, , basePath, companyId] = process.argv;
  if (!basePath || !companyId) {
    console.error('usage: restart-proof-write.js <basePath> <companyId>');
    process.exit(1);
  }

  const store = new FsImageStore(basePath);
  const ref = await store.put({
    companyId,
    collection: 'products',
    bytes: PAYLOAD,
    declaredMimeType: 'image/webp',
  });

  // The parent test process reads this ref from stdout and hands it to the
  // read-side process — the two never share memory or module state.
  process.stdout.write(ref);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
