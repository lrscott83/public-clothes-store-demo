/**
 * Port for a product image blob store. States the intent — put product
 * image bytes, open product image bytes — never filesystem vocabulary
 * (`ensureDir`/`saveFile`/`getFullPath`/`fileExists`). Both `api-public` and
 * `api-salesops` inject `PRODUCT_IMAGE_STORE`; the concrete adapter
 * (`FsProductImageStore`, `packages/infra-storage`) is the only place that
 * knows bytes live on disk (design.md D1).
 */

/** Opaque to the domain — e.g. `'products/<uuid>.webp'`. Never a full path. */
export type ProductImageRef = string;

export interface PutProductImageInput {
  readonly companyId: string;
  /** Not `Buffer`: the domain stays runtime-agnostic. */
  readonly bytes: Uint8Array;
  /** Validated at delivery; the adapter re-checks. */
  readonly declaredMimeType: string;
}

export interface ProductImageContent {
  /** Streamed, never buffered — see design.md D6. */
  readonly stream: AsyncIterable<Uint8Array>;
  readonly contentType: string;
  readonly byteLength: number;
}

/**
 * `companyId` is an explicit argument on both methods, never read from
 * `AsyncLocalStorage`. The adapter always resolves under
 * `<base>/<companyId>/`, so a ref belonging to tenant A cannot be opened
 * through tenant B's request even if it is guessed — tenancy is in the
 * signature, not in ambient state.
 */
export interface IProductImageStore {
  put(input: PutProductImageInput): Promise<ProductImageRef>;
  /** `null` when the ref resolves to nothing. A missing file is an ANSWER here, not a throw. */
  open(companyId: string, ref: ProductImageRef): Promise<ProductImageContent | null>;
}

/** DI token for `IProductImageStore` — consumers inject by this symbol. */
export const PRODUCT_IMAGE_STORE = Symbol('IProductImageStore');

/** Thrown by `assertProductImageRef` when a ref does not match the grammar below. */
export class InvalidProductImageRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProductImageRefError';
  }
}

/**
 * Deliberately permissive enough to cover the seeded rows
 * (`products/cafeteras/cafeteras1.jpeg`) without a migration, while still
 * rejecting path traversal (`..`), an absolute path (leading `/`), and a
 * Windows-style separator (`\`) — all three are already excluded by the
 * pattern itself (`.` and `\` are not in the allowed middle character
 * class, and a leading `/` cannot match `[a-z0-9]` as the first character),
 * so the writer and the reader agree by construction.
 */
const PRODUCT_IMAGE_REF_PATTERN = /^[a-z0-9][a-z0-9/_-]*\.(webp|jpe?g|png)$/;

/** Validates a `ProductImageRef` grammar. Pure, unit-testable with no filesystem. */
export function assertProductImageRef(ref: string): void {
  if (typeof ref !== 'string' || !PRODUCT_IMAGE_REF_PATTERN.test(ref)) {
    throw new InvalidProductImageRefError(`Invalid product image ref: ${JSON.stringify(ref)}`);
  }
}
