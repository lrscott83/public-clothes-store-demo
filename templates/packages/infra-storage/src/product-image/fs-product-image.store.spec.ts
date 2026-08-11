import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InvalidProductImageRefError } from '@store-mgmt/domain';
import { FsProductImageStore, UnsupportedProductImageMimeTypeError } from './fs-product-image.store.js';

async function drain(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe('FsProductImageStore', () => {
  let basePath: string;
  let store: FsProductImageStore;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'infra-storage-'));
    store = new FsProductImageStore(basePath);
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('put() then open() round-trips the exact bytes just written', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    const ref = await store.put({
      companyId: 'company-a',
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
    'open() rejects the path-traversal ref %s via assertProductImageRef, never touching disk',
    async (hostileRef) => {
      await expect(store.open('company-a', hostileRef)).rejects.toBeInstanceOf(
        InvalidProductImageRefError,
      );
    },
  );

  it('derives the stored extension from declaredMimeType alone — png in, .png out', async () => {
    const ref = await store.put({
      companyId: 'company-a',
      bytes: new Uint8Array([9, 9]),
      declaredMimeType: 'image/png',
    });

    expect(ref).toMatch(/\.png$/);
  });

  it(
    'rejects a declaredMimeType outside the image allowlist — the "adapter re-checks" ' +
      'promise from the port doc (design.md D1/D10), never writing anything to disk. ' +
      'PutProductImageInput has no filename field at all, so a hostile CLIENT FILENAME ' +
      'cannot influence the stored extension by construction; this proves the one input ' +
      'that COULD smuggle a bad extension — a mismatched declaredMimeType — is rejected too',
    async () => {
      await expect(
        store.put({
          companyId: 'company-a',
          bytes: new Uint8Array([1, 2, 3]),
          declaredMimeType: 'application/x-msdownload',
        }),
      ).rejects.toBeInstanceOf(UnsupportedProductImageMimeTypeError);

      // The rejection happens before any directory is even created for this
      // company — proving it is truly nothing-written, not "written then
      // regretted".
      await expect(readdir(join(basePath, 'company-a'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it('scopes storage per company: company B cannot open company A’s ref even with the identical ref string', async () => {
    const ref = await store.put({
      companyId: 'company-a',
      bytes: new Uint8Array([7, 7, 7]),
      declaredMimeType: 'image/webp',
    });

    const result = await store.open('company-b', ref);

    expect(result).toBeNull();
  });
});
