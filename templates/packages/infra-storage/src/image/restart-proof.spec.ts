import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Task 2.5 / spike 0.5, now unblocked by `FsProductImageStore` (2.1/2.2).
 *
 * Proves: a file written through `FsProductImageStore.put()` under a FIXED
 * `basePath` (never `os.tmpdir()`/`mkdtemp`, unlike 2.1's round-trip spec) is
 * still readable via `open()` after the WRITING PROCESS HAS DIED and a
 * brand-new one has started. `execFileSync` spawns a real, separate `node`
 * OS process for the write and blocks until it has fully exited — that is
 * the "died" half. Only then does a SECOND, unrelated `node` process spawn
 * for the read. The two never share memory, module cache, or event loop.
 *
 * Read this test alongside `packages/infra-storage/README.md`'s "What this
 * proves / does not prove" section before assuming more than what runs here.
 */
describe('FsProductImageStore — process-restart persistence (task 2.5 / spike 0.5)', () => {
  const packageRoot = resolve(__dirname, '../..');
  const basePath = join(packageRoot, '.storage-restart-proof');
  const companyId = 'restart-proof-company';
  const writeScript = join(packageRoot, 'scripts/restart-proof-write.js');
  const readScript = join(packageRoot, 'scripts/restart-proof-read.js');
  const expectedBytes = Buffer.from('spike-0.5-restart-proof-payload', 'utf8');

  beforeAll(() => {
    // The write/read scripts below run as PLAIN `node` processes against the
    // COMPILED package — the same artifact `api-salesops` and `api-public`
    // actually import (unlike every other spec in this package, which
    // ts-jest transforms `.ts` source in-process). Rebuild `dist/` here so
    // this proof never depends on a stale or missing prior `pnpm build`.
    execFileSync(join(packageRoot, 'node_modules/.bin/tsc'), [], {
      cwd: packageRoot,
      stdio: 'pipe',
    });
  });

  beforeEach(async () => {
    // FIXED path, not per-test-random — proves the mechanism the feature
    // depends on (a stable STORAGE_PATH, not "some directory or other").
    // Cleaned before AND after so this proof never leaves stray files.
    await rm(basePath, { recursive: true, force: true });
  });

  afterAll(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('bytes written by one process are readable by a brand-new process started after it died', () => {
    // Process 1: writes, then exits. `execFileSync` blocks until it has
    // genuinely terminated (non-zero exit throws) — this IS the "process
    // has died" half of the proof, not an approximation of it.
    const writeStdout = execFileSync('node', [writeScript, basePath, companyId], {
      encoding: 'utf8',
    });
    const ref = writeStdout.trim();
    expect(ref).toMatch(/^products\/[0-9a-f-]+\.webp$/);

    // Process 2: a brand-new `node` invocation with its own PID, spawned
    // only now that process 1 no longer exists. No shared state is possible.
    const readStdout = execFileSync('node', [readScript, basePath, companyId, ref], {
      encoding: 'utf8',
    });

    expect(Buffer.from(readStdout.trim(), 'base64')).toEqual(expectedBytes);
  });
});
