#!/usr/bin/env node
'use strict';

// Task 2.5 / spike 0.5 — the other half of the process-restart proof.
//
// Spawned by `restart-proof.spec.ts` only AFTER `restart-proof-write.js` has
// fully exited (its own `node` invocation has already died). This process
// has no memory of the write: it opens `FsImageStore` fresh against
// the same FIXED `basePath` and proves the bytes are still there.
const { FsImageStore } = require('../dist/image/fs-image.store.js');

async function drain(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main() {
  const [, , basePath, companyId, ref] = process.argv;
  if (!basePath || !companyId || !ref) {
    console.error('usage: restart-proof-read.js <basePath> <companyId> <ref>');
    process.exit(1);
  }

  const store = new FsImageStore(basePath);
  const content = await store.open(companyId, ref);
  if (!content) {
    console.error('NOT_FOUND');
    process.exit(1);
  }

  const bytes = await drain(content.stream);
  // base64 on stdout keeps the parent's assertion exact without dealing with
  // binary-safe stdout capture quirks across platforms.
  process.stdout.write(bytes.toString('base64'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
