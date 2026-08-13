/**
 * Port for an image blob store. States the intent — put image bytes, open
 * image bytes, delete image bytes — never filesystem vocabulary
 * (`ensureDir`/`saveFile`/`getFullPath`/`fileExists`). Both `api-public` and
 * `api-salesops` inject `IMAGE_STORE`; the concrete adapter (`FsImageStore`,
 * `packages/infra-storage`) is the only place that knows bytes live on disk.
 *
 * Generalised from the earlier product-only image-store port (design.md D1):
 * the adapter was always image-generic except for the one line that minted
 * the ref prefix.
 */

/** Which catalogue entity the bytes belong to. Becomes the ref's first path segment. */
export type ImageCollection = 'products' | 'categories';

/** Opaque to the domain — e.g. `'products/<uuid>.webp'`. Never a full path. */
export type ImageRef = string;

export interface PutImageInput {
  readonly companyId: string;
  readonly collection: ImageCollection;
  /** Not `Buffer`: the domain stays runtime-agnostic. */
  readonly bytes: Uint8Array;
  /** Validated at delivery; the adapter re-checks. */
  readonly declaredMimeType: string;
}

export interface ImageContent {
  /** Streamed, never buffered. */
  readonly stream: AsyncIterable<Uint8Array>;
  readonly contentType: string;
  readonly byteLength: number;
}

/**
 * `companyId` is an explicit argument on every method, never read from
 * `AsyncLocalStorage`. The adapter always resolves under `<base>/<companyId>/`,
 * so a ref belonging to tenant A cannot be opened through tenant B's request
 * even if it is guessed — tenancy is in the signature, not in ambient state.
 */
export interface IImageStore {
  put(input: PutImageInput): Promise<ImageRef>;
  /** `null` when the ref resolves to nothing. A missing file is an ANSWER here, not a throw. */
  open(companyId: string, ref: ImageRef): Promise<ImageContent | null>;
  /**
   * Removes the bytes a ref points at. Idempotent: a ref that resolves to
   * nothing is a no-op, never a throw.
   *
   * Callers own the decision of WHAT is safe to delete, and `isUploadMintedRef`
   * below is how they decide — the store deletes only what the store minted.
   */
  delete(companyId: string, ref: ImageRef): Promise<void>;
}

/** DI token for `IImageStore` — consumers inject by this symbol. */
export const IMAGE_STORE = Symbol('IImageStore');

/** Thrown by `assertImageRef` when a ref does not match the grammar below. */
export class InvalidImageRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidImageRefError';
  }
}

/**
 * Deliberately permissive enough to cover the seeded rows
 * (`products/cafeteras/cafeteras1.jpeg`) without a migration, while still
 * rejecting path traversal (`..`), an absolute path (leading `/`), and a
 * Windows-style separator (`\`) — all three are excluded by the pattern
 * itself, so the writer and the reader agree by construction.
 */
const IMAGE_REF_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.(webp|jpe?g|png)$/;

/** Validates an `ImageRef` grammar. Pure, unit-testable with no filesystem. */
export function assertImageRef(ref: string): void {
  if (typeof ref !== 'string' || !IMAGE_REF_PATTERN.test(ref)) {
    throw new InvalidImageRefError(`Invalid image ref: ${JSON.stringify(ref)}`);
  }
}

/** Exactly the shape `FsImageStore.put` mints: `<collection>/<uuid>.<ext>`. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * True when this ref was minted by `put` for THIS collection — i.e. it was
 * created for one row at one moment and no human ever typed it.
 *
 * Every destructive path is gated on this (design.md D3). A seeded catalog ref
 * (`products/cafeteras/x.jpeg`) or anything hand-authored is never matched,
 * because we cannot prove another row does not point at it. The collection is
 * REQUIRED rather than inferred: a category ref must not read as minted to the
 * product controller.
 */
export function isUploadMintedRef(
  ref: string | null | undefined,
  collection: ImageCollection,
): ref is string {
  if (typeof ref !== 'string') return false;
  return new RegExp(`^${collection}/${UUID}\\.(webp|jpeg|png)$`).test(ref);
}
