import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable, Optional } from '@nestjs/common';
import {
  assertProductImageRef,
  type IProductImageStore,
  type ProductImageContent,
  type ProductImageRef,
  type PutProductImageInput,
} from '@store-mgmt/domain';

/**
 * `declaredMimeType` -> stored extension. Deliberately an ALLOWLIST, not a
 * pass-through: `PutProductImageInput` has no filename field at all (design.md
 * D1), so the "extension from a client-supplied filename" attack surface does
 * not exist at this port. This map is the "adapter re-checks" half of the
 * port doc's promise on `declaredMimeType` — an unrecognised value is
 * rejected outright rather than silently mapped to something on disk.
 */
const EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
};

export class UnsupportedProductImageMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported product image MIME type: ${JSON.stringify(mimeType)}`);
    this.name = 'UnsupportedProductImageMimeTypeError';
  }
}

function extensionFor(declaredMimeType: string): string {
  const extension = EXTENSION_BY_MIME_TYPE[declaredMimeType];
  if (!extension) {
    throw new UnsupportedProductImageMimeTypeError(declaredMimeType);
  }
  return extension;
}

function contentTypeFor(ref: ProductImageRef): string {
  const extension = ref.slice(ref.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  return 'image/webp';
}

function defaultStoragePath(): string {
  return process.env.STORAGE_PATH ?? resolve(process.cwd(), 'storage');
}

function isNotFound(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT';
}

/**
 * `IProductImageStore` adapter (design.md D1): puts/opens product image bytes
 * under `<basePath>/<companyId>/<ref>`. `companyId` is an explicit argument on
 * both methods (never ambient state) so a ref belonging to one tenant cannot
 * be opened through another tenant's request even if it is guessed.
 *
 * The only file in this package that knows bytes live on disk. `normalize-image.ts`
 * (2.3/2.4) is the only file that knows about `sharp`; this class has no
 * opinion on image formats beyond the extension allowlist above.
 */
@Injectable()
export class FsProductImageStore implements IProductImageStore {
  private readonly basePath: string;

  /**
   * `@Optional()` is load-bearing, not decorative — discovered wiring Phase
   * 3 (`apps/api-salesops` product.module.ts importing `InfraStorageModule`
   * for real, the first consumer to put this class through Nest's actual DI
   * container; Phase 2's own suite always called `new FsProductImageStore(...)`
   * directly). `basePath: string` reflects as the `String` design-time type;
   * without `@Optional()`, Nest tries to resolve a provider for `String`,
   * finds none, and throws before the `= defaultStoragePath()` default ever
   * gets a chance to apply — same class of bug `TenantPrismaFactory`'s
   * constructor already documents (`packages/infra-db/src/tenant/tenant-prisma-factory.ts`).
   * `@Optional()` makes Nest inject `undefined` instead of throwing, which
   * is exactly what lets the default take over.
   */
  constructor(@Optional() basePath: string = defaultStoragePath()) {
    this.basePath = basePath;
  }

  async put(input: PutProductImageInput): Promise<ProductImageRef> {
    const extension = extensionFor(input.declaredMimeType);
    const ref: ProductImageRef = `products/${randomUUID()}.${extension}`;
    // Defensive, not decorative: proves the ref we just built agrees with the
    // same grammar `open()` (and every other consumer) enforces.
    assertProductImageRef(ref);

    const destination = this.resolve(input.companyId, ref);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, input.bytes);

    return ref;
  }

  async open(companyId: string, ref: ProductImageRef): Promise<ProductImageContent | null> {
    // Reuses 1.3/1.4's port-level validator — the writer and the reader agree
    // by construction. This IS the path-traversal gate; it throws (never
    // returns null) because a malformed ref is a caller bug, not "missing file".
    assertProductImageRef(ref);

    const filePath = this.resolve(companyId, ref);

    let byteLength: number;
    try {
      byteLength = (await stat(filePath)).size;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }

    return {
      stream: createReadStream(filePath),
      contentType: contentTypeFor(ref),
      byteLength,
    };
  }

  async delete(companyId: string, ref: ProductImageRef): Promise<void> {
    // Same gate as `put`/`open` — a destructive operation gets no weaker a
    // traversal check than a read.
    assertProductImageRef(ref);

    try {
      await unlink(this.resolve(companyId, ref));
    } catch (err) {
      // Idempotent by contract: the bytes are already gone, which is the
      // outcome the caller asked for. Any OTHER error (EACCES, EISDIR) is a
      // real fault and propagates.
      if (isNotFound(err)) return;
      throw err;
    }
  }

  private resolve(companyId: string, ref: string): string {
    return join(this.basePath, companyId, ref);
  }
}
