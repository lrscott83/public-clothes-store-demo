import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidImageRefError } from '@store-mgmt/domain';
import { FsImageStore, UnsupportedImageMimeTypeError } from './fs-image.store.js';

async function drain(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('FsImageStore', () => {
  let basePath: string;
  let store: FsImageStore;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'infra-storage-'));
    store = new FsImageStore(basePath);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('put() then open() round-trips the exact bytes just written', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const ref = await store.put({
      companyId: 'company-a',
      collection: 'products',
      bytes,
      declaredMimeType: 'image/webp',
    });

    expect(ref).toMatch(/^products\/[0-9a-f-]+\.webp$/);

    const content = await store.open('company-a', ref);

    expect(content).not.toBeNull();
    await expect(drain(content!.stream)).resolves.toEqual(Buffer.from(bytes));
    expect(content!.contentType).toBe('image/webp');
    expect(content!.byteLength).toBe(bytes.byteLength);
  });

  it('open() returns null for a well-formed ref that resolves to nothing on disk', async () => {
    const result = await store.open(
      'company-a',
      'products/00000000-0000-0000-0000-000000000000.webp',
    );

    expect(result).toBeNull();
  });

  it.each(['../escape.webp', '/etc/passwd.webp', 'products\\evil.webp'])(
    'open() rejects the path-traversal ref %s via assertImageRef, never touching disk',
    async (hostileRef) => {
      await expect(store.open('company-a', hostileRef)).rejects.toBeInstanceOf(
        InvalidImageRefError,
      );
    },
  );

  it('derives the stored extension from declaredMimeType alone — png in, .png out', async () => {
    const ref = await store.put({
      companyId: 'company-a',
      collection: 'products',
      bytes: new Uint8Array([9, 9]),
      declaredMimeType: 'image/png',
    });

    expect(ref).toMatch(/\.png$/);
  });

  it(
    'rejects a declaredMimeType outside the image allowlist — the "adapter re-checks" ' +
      'promise from the port doc (design.md D1/D10), never writing anything to disk. ' +
      'PutImageInput has no filename field at all, so a hostile CLIENT FILENAME ' +
      'cannot influence the stored extension by construction; this proves the one input ' +
      'that COULD smuggle a bad extension — a mismatched declaredMimeType — is rejected too',
    async () => {
      await expect(
        store.put({
          companyId: 'company-a',
          collection: 'products',
          bytes: new Uint8Array([1, 2, 3]),
          declaredMimeType: 'application/x-msdownload',
        }),
      ).rejects.toBeInstanceOf(UnsupportedImageMimeTypeError);

      // The rejection happens before any directory is even created for this
      // company — proving it is truly nothing-written, not "written then
      // regretted".
      await expect(readdir(join(basePath, 'company-a'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it("scopes storage per company: company B cannot open company A's ref even with the identical ref string", async () => {
    const ref = await store.put({
      companyId: 'company-a',
      collection: 'products',
      bytes: new Uint8Array([7, 7, 7]),
      declaredMimeType: 'image/webp',
    });

    const result = await store.open('company-b', ref);

    expect(result).toBeNull();
  });

  it('delete() removes the bytes — a subsequent open() of the same ref returns null', async () => {
    const ref = await store.put({
      companyId: 'company-a',
      collection: 'products',
      bytes: new Uint8Array([4, 2]),
      declaredMimeType: 'image/webp',
    });

    // Drained, not merely asserted non-null: `open()` hands back a live
    // `createReadStream`, and an unconsumed one whose file is deleted out
    // from under it raises an async ENOENT that fails the test for the
    // wrong reason. Draining both proves the bytes were really there AND
    // closes the handle before the delete below.
    const before = await store.open('company-a', ref);
    expect(before).not.toBeNull();
    await expect(drain(before!.stream)).resolves.toEqual(Buffer.from([4, 2]));

    await store.delete('company-a', ref);

    await expect(store.open('company-a', ref)).resolves.toBeNull();
  });

  it('delete() is idempotent: a well-formed ref that resolves to nothing on disk is a no-op, never a throw', async () => {
    await expect(
      store.delete('company-a', 'products/00000000-0000-0000-0000-000000000000.webp'),
    ).resolves.toBeUndefined();
  });

  it.each(['../escape.webp', '/etc/passwd.webp', 'products\\evil.webp'])(
    'delete() rejects the path-traversal ref %s via assertImageRef, never touching disk',
    async (hostileRef) => {
      await expect(store.delete('company-a', hostileRef)).rejects.toBeInstanceOf(
        InvalidImageRefError,
      );
    },
  );

  it(
    'delete() propagates a real filesystem fault instead of swallowing it — only ' +
      '"already gone" (ENOENT) is treated as success, so a permissions/EISDIR problem ' +
      'surfaces rather than silently reporting the bytes as removed',
    async () => {
      // A directory sitting where a file is expected makes unlink() fail with
      // EISDIR/EPERM — a non-ENOENT error, which is the branch under test.
      const ref = 'products/00000000-0000-0000-0000-0000000000ff.webp';
      await mkdir(join(basePath, 'company-a', ref), { recursive: true });

      await expect(store.delete('company-a', ref)).rejects.toMatchObject({
        code: expect.stringMatching(/^(EISDIR|EPERM)$/),
      });
    },
  );

  it(
    "scopes deletion per company: company B deleting company A's exact ref string leaves " +
      "A's bytes intact. Deletion is destructive and irreversible, so the per-company " +
      'path scoping matters more here than on open() — a cross-tenant delete would be ' +
      'silent data loss, not merely a leaked read',
    async () => {
      const ref = await store.put({
        companyId: 'company-a',
        collection: 'products',
        bytes: new Uint8Array([7, 7, 7]),
        declaredMimeType: 'image/webp',
      });

      await store.delete('company-b', ref);

      const survived = await store.open('company-a', ref);
      expect(survived).not.toBeNull();
      await expect(drain(survived!.stream)).resolves.toEqual(Buffer.from([7, 7, 7]));
    },
  );

  describe('put — collection prefix', () => {
    it('mints a products ref for the products collection', async () => {
      const store = new FsImageStore(basePath);

      const ref = await store.put({
        companyId: 'company-1',
        collection: 'products',
        bytes: new Uint8Array([1, 2, 3]),
        declaredMimeType: 'image/webp',
      });

      expect(ref).toMatch(
        /^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/,
      );
    });

    it('mints a categories ref for the categories collection', async () => {
      const store = new FsImageStore(basePath);

      const ref = await store.put({
        companyId: 'company-1',
        collection: 'categories',
        bytes: new Uint8Array([1, 2, 3]),
        declaredMimeType: 'image/png',
      });

      expect(ref).toMatch(
        /^categories\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
    });

    it('keeps the two collections in separate directories for the same company', async () => {
      const store = new FsImageStore(basePath);
      const bytes = new Uint8Array([1, 2, 3]);

      const productRef = await store.put({
        companyId: 'company-1', collection: 'products', bytes, declaredMimeType: 'image/webp',
      });
      const categoryRef = await store.put({
        companyId: 'company-1', collection: 'categories', bytes, declaredMimeType: 'image/webp',
      });

      // Deleting one must not affect the other, even though both are the same bytes.
      await store.delete('company-1', productRef);

      expect(await store.open('company-1', productRef)).toBeNull();
      expect(await store.open('company-1', categoryRef)).not.toBeNull();
    });
  });
});
