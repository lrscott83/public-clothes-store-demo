# admin-image-crud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make product and category images optional, uploadable, replaceable and removable from their admin CRUDs, with the raw storage ref no longer writable by a human.

**Architecture:** The domain's `IProductImageStore` port generalises to `IImageStore` with a `collection` discriminator (`products` | `categories`), keeping one adapter and one traversal gate. `Product.image` becomes nullable in both Prisma schemas. `api-salesops` grows authenticated read/upload/delete image endpoints for both entities and rejects upload-minted refs arriving through create/update bodies. `web-catalog` replaces both raw-ref text inputs with file pickers and proxies image bytes to the browser through its own `withAuth`-guarded resource routes.

**Tech Stack:** pnpm + turbo monorepo. NestJS 11 (`api-salesops`, `api-public`) with jest + supertest, co-located `*.spec.ts`. React Router 7 SSR (`web-catalog`) with vitest + jsdom + testing-library. Prisma 7 (master schema via migrations, tenant schema via generated DDL). `sharp` via `@store-mgmt/infra-storage`.

**Spec:** [`openspec/changes/admin-image-crud/design.md`](./design.md) â€” read it before starting. Every task below argues from a decision in it (D1-D8).

## Global Constraints

- **Strict TDD.** Every implementation step is preceded by a failing test and its RED run. No implementation lands without a test that failed first.
- **Commit per task**, following `work-unit-commits`: one purpose, tests included, message states the outcome. Conventional commits. **Never** add `Co-Authored-By` or AI attribution.
- **Lint gates:** NestJS apps and packages `--max-warnings 0`; `web-catalog` `--max-warnings 5`.
- **Coverage gates are a per-package ratchet frozen at each package's own baseline.** Run `pnpm --filter <pkg> test:cov` as each package's last task, not once at the end. A new file that dips a package below its threshold fails the build.
- **Both Prisma schemas or neither.** `prisma/master/schema.prisma` and `prisma/tenant/schema.prisma` are edited together. A tenant-only change passes every local test and fails in production.
- **Refs are opaque.** No code outside `packages/infra-storage` may build, parse or join a filesystem path from a ref.
- Code, comments, identifiers and UI copy in this repo: UI copy is **Spanish** (matching the existing admin), code and comments **English**.

---

## File Structure

**`packages/domain`**
- Create `src/image/image-store.port.ts` â€” the generalised port: types, DI token, `assertImageRef`, `isUploadMintedRef`.
- Create `src/image/index.ts` â€” barrel.
- Delete `src/product/product-image-store.port.ts` and its `.test.ts` (content moves).
- Modify `src/product/index.ts` (drop the port export), `src/index.ts` (add `./image/index.js`), `src/product/product.ts` (`image` nullable).

**`packages/infra-storage`**
- Rename `src/product-image/fs-product-image.store.ts` â†’ `src/image/fs-image.store.ts` (`FsImageStore`).
- Move `src/product-image/normalize-image.ts` â†’ `src/image/normalize-image.ts` (unchanged content).
- Modify `src/infra-storage.module.ts`, `src/index.ts`.

**`packages/infra-db`**
- Modify `prisma/master/schema.prisma`, `prisma/tenant/schema.prisma`; add a master migration; regenerate `prisma/tenant-schema.sql`.
- Modify the Prisma product repository mapper for the nullable column.

**`apps/api-salesops`**
- Create `src/image/assert-not-minted-ref.ts` â€” the D4 guard, shared by both controllers.
- Create `src/image/stream-image.ts` â€” the D5 admin read, shared by both controllers.
- Modify `src/product/product.controller.ts`, `src/product/dto/*`, `src/category/category.controller.ts`, `src/category/category.module.ts`.

**`apps/api-public`**
- Modify `src/product/to-public-product-dto.ts`, `src/product/dto/public-product.dto.ts`, `src/product/product-image.controller.ts` (import renames only).

**`apps/web-catalog`**
- Create `app/shared/components/image-placeholder.tsx` â€” one placeholder, four call sites.
- Create `app/admin/routes/productos/image.tsx` and `app/admin/routes/categorias/image.tsx` â€” D5b proxy routes.
- Modify both forms, both create/edit routes, both list routes, `app/routes.ts`, `app/admin/lib/*.server.ts`, `app/admin/lib/admin-api.types.ts`, `app/catalog/components/product-card.tsx`, `app/catalog/routes/product-detail.tsx`, `app/shared/lib/public-api.types.ts`.

---

## Phase 1 â€” `packages/domain`: the port generalises

### Task 1.1: `assertImageRef` and `isUploadMintedRef`

**Files:**
- Create: `templates/packages/domain/src/image/image-store.port.ts`
- Create: `templates/packages/domain/src/image/image-store.port.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ImageCollection`, `ImageRef`, `PutImageInput`, `ImageContent`, `IImageStore`, `IMAGE_STORE`, `InvalidImageRefError`, `assertImageRef(ref: string): void`, `isUploadMintedRef(ref: string | null | undefined, collection: ImageCollection): ref is string`.

- [x] **Step 1: Write the failing test**

Create `templates/packages/domain/src/image/image-store.port.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertImageRef,
  InvalidImageRefError,
  isUploadMintedRef,
} from './image-store.port.js';

describe('assertImageRef', () => {
  it.each([
    'products/cafeteras/cafeteras1.jpeg',
    'categories/remeras.jpg',
    'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.png',
  ])('accepts %s', (ref) => {
    expect(() => assertImageRef(ref)).not.toThrow();
  });

  it.each([
    '../etc/passwd',
    '/absolute/path.png',
    'products\\windows.png',
    'products/no-extension',
    'products/x.gif',
    'Products/Upper.png',
  ])('rejects %s', (ref) => {
    expect(() => assertImageRef(ref)).toThrow(InvalidImageRefError);
  });
});

describe('isUploadMintedRef', () => {
  it('recognises a ref the store minted for that collection', () => {
    expect(
      isUploadMintedRef('products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toBe(true);
    expect(
      isUploadMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'categories'),
    ).toBe(true);
  });

  it('does not match a minted ref from a DIFFERENT collection', () => {
    expect(
      isUploadMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toBe(false);
  });

  it.each([
    ['a seeded ref', 'products/cafeteras/cafeteras1.jpeg'],
    ['a hand-authored ref', 'products/remera.jpg'],
    ['null', null],
    ['undefined', undefined],
  ])('does not match %s', (_label, ref) => {
    expect(isUploadMintedRef(ref as string | null | undefined, 'products')).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/domain test -- image-store.port`
Expected: FAIL â€” cannot resolve `./image-store.port.js`.

- [x] **Step 3: Write the implementation**

Create `templates/packages/domain/src/image/image-store.port.ts`. Start from the current
`src/product/product-image-store.port.ts` and apply the renames; the doc comments below are
the parts that CHANGE, keep the rest of the originals.

```ts
/**
 * Port for an image blob store. States the intent â€” put image bytes, open
 * image bytes, delete image bytes â€” never filesystem vocabulary
 * (`ensureDir`/`saveFile`/`getFullPath`/`fileExists`). Both `api-public` and
 * `api-salesops` inject `IMAGE_STORE`; the concrete adapter (`FsImageStore`,
 * `packages/infra-storage`) is the only place that knows bytes live on disk.
 *
 * Generalised from `IProductImageStore` (design.md D1): the adapter was always
 * image-generic except for the one line that minted the ref prefix.
 */

/** Which catalogue entity the bytes belong to. Becomes the ref's first path segment. */
export type ImageCollection = 'products' | 'categories';

/** Opaque to the domain â€” e.g. `'products/<uuid>.webp'`. Never a full path. */
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
 * even if it is guessed â€” tenancy is in the signature, not in ambient state.
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
   * below is how they decide â€” the store deletes only what the store minted.
   */
  delete(companyId: string, ref: ImageRef): Promise<void>;
}

/** DI token for `IImageStore` â€” consumers inject by this symbol. */
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
 * Windows-style separator (`\`) â€” all three are excluded by the pattern
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
 * True when this ref was minted by `put` for THIS collection â€” i.e. it was
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
```

Create `templates/packages/domain/src/image/index.ts`:

```ts
export * from './image-store.port.js';
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @store-mgmt/domain test -- image-store.port`
Expected: PASS, all cases.

- [x] **Step 5: Commit**

```bash
git add templates/packages/domain/src/image/
git commit -m "feat(domain): add the collection-aware IImageStore port"
```

---

### Task 1.2: Retire `IProductImageStore` and repoint every consumer

**Files:**
- Delete: `templates/packages/domain/src/product/product-image-store.port.ts`, `templates/packages/domain/src/product/product-image-store.port.test.ts`
- Modify: `templates/packages/domain/src/product/index.ts`, `templates/packages/domain/src/index.ts`

**Interfaces:**
- Consumes: Task 1.1's exports.
- Produces: `@store-mgmt/domain` exporting the new names and **no longer exporting** `IProductImageStore`, `ProductImageRef`, `PutProductImageInput`, `ProductImageContent`, `PRODUCT_IMAGE_STORE`, `assertProductImageRef`, `InvalidProductImageRefError`.

This task deliberately leaves the repo RED across other packages â€” Tasks 2.x and 4.x repair them. Do not repair them here; the point is one reviewable rename commit.

- [x] **Step 1: Delete the old port and its test**

```bash
git rm templates/packages/domain/src/product/product-image-store.port.ts \
       templates/packages/domain/src/product/product-image-store.port.test.ts
```

- [x] **Step 2: Drop the export from the product barrel**

In `templates/packages/domain/src/product/index.ts`, remove this line:

```ts
export * from './product-image-store.port.js';
```

- [x] **Step 3: Add the image barrel to the root barrel**

In `templates/packages/domain/src/index.ts`, add after the `./product/index.js` line:

```ts
export * from './image/index.js';
```

- [x] **Step 4: Verify the package is green and the old names are gone**

Run: `pnpm --filter @store-mgmt/domain typecheck && pnpm --filter @store-mgmt/domain test`
Expected: PASS.

Run: `grep -rn "IProductImageStore\|PRODUCT_IMAGE_STORE\|assertProductImageRef" templates/packages/domain/src`
Expected: no output.

- [x] **Step 5: Commit**

```bash
git add -A templates/packages/domain
git commit -m "refactor(domain): retire IProductImageStore in favour of IImageStore"
```

---

## Phase 2 â€” `packages/infra-storage`: one adapter, two collections

### Task 2.1: `FsImageStore` mints under the requested collection

**Files:**
- Create: `templates/packages/infra-storage/src/image/fs-image.store.ts` (from the old file)
- Create: `templates/packages/infra-storage/src/image/fs-image.store.spec.ts` (from the old spec)
- Delete: `templates/packages/infra-storage/src/product-image/fs-product-image.store.ts` and its spec
- Modify: `templates/packages/infra-storage/src/product-image/restart-proof.spec.ts` â†’ move to `src/image/restart-proof.spec.ts`
- Move: `templates/packages/infra-storage/src/product-image/normalize-image.ts` (+ spec) â†’ `src/image/`

**Interfaces:**
- Consumes: `IImageStore`, `PutImageInput`, `ImageRef`, `ImageContent`, `assertImageRef` from `@store-mgmt/domain`.
- Produces: `FsImageStore` (class, `@Injectable()`, `constructor(@Optional() basePath?: string)`), `UnsupportedImageMimeTypeError`.

- [x] **Step 1: Write the failing test**

Move the existing spec to `templates/packages/infra-storage/src/image/fs-image.store.spec.ts`,
rename `FsProductImageStore` â†’ `FsImageStore` and add `collection` to every `put` call. Then
append this new block, which is the actual behaviour change:

```ts
describe('put â€” collection prefix', () => {
  it('mints a products ref for the products collection', async () => {
    const store = new FsImageStore(tmpDir);

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
    const store = new FsImageStore(tmpDir);

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
    const store = new FsImageStore(tmpDir);
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
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/infra-storage test`
Expected: FAIL â€” cannot resolve `./fs-image.store.js`.

- [x] **Step 3: Write the implementation**

`git mv` the adapter to `src/image/fs-image.store.ts`, then apply exactly these changes and
leave the rest of the file (the `@Optional()` doc comment, `resolve`, `open`, `delete`,
`contentTypeFor`, `defaultStoragePath`, `isNotFound`) byte-identical:

```ts
// class rename
export class UnsupportedImageMimeTypeError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported image MIME type: ${JSON.stringify(mimeType)}`);
    this.name = 'UnsupportedImageMimeTypeError';
  }
}

@Injectable()
export class FsImageStore implements IImageStore {
  // ...unchanged constructor...

  async put(input: PutImageInput): Promise<ImageRef> {
    const extension = extensionFor(input.declaredMimeType);
    // The ONE line that used to be product-specific (design.md D1).
    const ref: ImageRef = `${input.collection}/${randomUUID()}.${extension}`;
    // Defensive, not decorative: proves the ref we just built agrees with the
    // same grammar `open()` (and every other consumer) enforces.
    assertImageRef(ref);

    const destination = this.resolve(input.companyId, ref);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, input.bytes);

    return ref;
  }
}
```

Also `git mv` `normalize-image.ts` (+ its spec) and `restart-proof.spec.ts` into `src/image/`,
updating only their relative imports. `normalize-image.ts`'s contents do not change.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @store-mgmt/infra-storage test`
Expected: PASS, including the pre-existing restart-proof spec.

- [x] **Step 5: Commit**

```bash
git add -A templates/packages/infra-storage/src
git commit -m "feat(infra-storage): mint image refs under the requested collection"
```

---

### Task 2.2: Rebind the module and the package barrel

**Files:**
- Modify: `templates/packages/infra-storage/src/infra-storage.module.ts`
- Modify: `templates/packages/infra-storage/src/index.ts`

**Interfaces:**
- Consumes: `FsImageStore` (2.1), `IMAGE_STORE` (1.1).
- Produces: `InfraStorageModule` providing and exporting `IMAGE_STORE`; package barrel exporting `FsImageStore`, `UnsupportedImageMimeTypeError`, `normalizeImage`, `UnsupportedImageError`, `NormalizedImage`.

- [x] **Step 1: Write the failing test**

Create `templates/packages/infra-storage/src/infra-storage.module.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { IMAGE_STORE, type IImageStore } from '@store-mgmt/domain';
import { InfraStorageModule } from './infra-storage.module.js';
import { FsImageStore } from './image/fs-image.store.js';

describe('InfraStorageModule', () => {
  it('binds IMAGE_STORE to the filesystem adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InfraStorageModule],
    }).compile();

    const store = moduleRef.get<IImageStore>(IMAGE_STORE);

    expect(store).toBeInstanceOf(FsImageStore);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/infra-storage test -- infra-storage.module`
Expected: FAIL â€” `IMAGE_STORE` has no provider (module still binds `PRODUCT_IMAGE_STORE`).

- [x] **Step 3: Write the implementation**

`templates/packages/infra-storage/src/infra-storage.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { IMAGE_STORE } from '@store-mgmt/domain';
import { FsImageStore } from './image/fs-image.store.js';

/**
 * Binds the concrete adapter to the domain's `IMAGE_STORE` token (design.md
 * D1). Unlike `InfraDbModule` â€” which exports concrete services for each
 * consumer app to bind against its OWN abstract token â€” this module owns the
 * binding itself: both `api-public` and `api-salesops` import
 * `InfraStorageModule` and inject `IMAGE_STORE` directly, with no per-app
 * rebinding. There is exactly one adapter for this port today, and it now
 * serves both the products and the categories collections.
 */
@Module({
  providers: [{ provide: IMAGE_STORE, useClass: FsImageStore }],
  exports: [IMAGE_STORE],
})
export class InfraStorageModule {}
```

`templates/packages/infra-storage/src/index.ts`:

```ts
export { InfraStorageModule } from './infra-storage.module.js';
export { FsImageStore, UnsupportedImageMimeTypeError } from './image/fs-image.store.js';
export {
  normalizeImage,
  UnsupportedImageError,
  type NormalizedImage,
} from './image/normalize-image.js';
```

- [x] **Step 4: Run the full package suite**

Run: `pnpm --filter @store-mgmt/infra-storage typecheck && pnpm --filter @store-mgmt/infra-storage test:cov`
Expected: PASS, coverage at or above the package's frozen threshold.

- [x] **Step 5: Commit**

```bash
git add templates/packages/infra-storage/src
git commit -m "refactor(infra-storage): bind and export the generalised image store"
```

---

## Phase 3 â€” Schema: a product may have no image

### Task 3.1: `Product.image` becomes nullable in both schemas

**Files:**
- Modify: `templates/packages/infra-db/prisma/master/schema.prisma:179`
- Modify: `templates/packages/infra-db/prisma/tenant/schema.prisma:92`
- Create: `templates/packages/infra-db/prisma/master/migrations/<timestamp>_product_image_nullable/migration.sql`
- Regenerate: `templates/packages/infra-db/prisma/tenant-schema.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a `product.image` column that accepts `NULL` in both the master schema and every tenant schema.

- [x] **Step 1: Edit both schema files**

In **both** `prisma/master/schema.prisma` and `prisma/tenant/schema.prisma`, change the
`Product` model's image line:

```prisma
  image                String?
```

Leave `Category.image` alone â€” it is already `String?`.

- [x] **Step 2: Generate the master migration**

Run: `pnpm --filter @store-mgmt/infra-db prisma:migrate -- --name product_image_nullable`

Expected `migration.sql` (verify it matches â€” a `DROP`/`ADD` instead of an `ALTER` means the
schema edit was wrong and would destroy data):

```sql
-- AlterTable
ALTER TABLE "product" ALTER COLUMN "image" DROP NOT NULL;
```

- [x] **Step 3: Regenerate the tenant DDL artifact**

Run: `cd templates/packages/infra-db && node scripts/generate-tenant-schema-sql.ts`

Confirm `prisma/tenant-schema.sql`'s `product` table now declares `image TEXT` with no
`NOT NULL`. This file provisions NEW tenants; existing tenant schemas are altered by
`scripts/tenant-migrate.ts`, which diffs against the same `schema.prisma`.

- [x] **Step 4: Verify the package still builds and tests green**

Run: `pnpm --filter @store-mgmt/infra-db prisma:generate && pnpm --filter @store-mgmt/infra-db typecheck`
Expected: PASS. The generated client now types `image` as `string | null`.

- [x] **Step 5: Commit**

```bash
git add templates/packages/infra-db/prisma
git commit -m "feat(infra-db): allow product.image to be null in master and tenant schemas"
```

---

### Task 3.2: The domain `Product` carries a nullable image

**Files:**
- Modify: `templates/packages/domain/src/product/product.ts:28,53,141`
- Modify: `templates/packages/domain/src/product/product.test.ts`
- Modify: the Prisma product repository mapper in `templates/packages/infra-db/src/product/`

**Interfaces:**
- Consumes: Task 3.1's nullable column.
- Produces: `Product.image: string | null`; `CreateProductInput.image?: string | null`; `createProduct` defaulting a missing image to `null`.

- [x] **Step 1: Write the failing test**

Append to `templates/packages/domain/src/product/product.test.ts`:

```ts
describe('createProduct â€” optional image', () => {
  it('defaults a missing image to null', () => {
    const product = createProduct({ ...validCreateProductInput, image: undefined });

    expect(product.image).toBeNull();
  });

  it('keeps an explicitly provided ref', () => {
    const product = createProduct({
      ...validCreateProductInput,
      image: 'products/cafeteras/cafeteras1.jpeg',
    });

    expect(product.image).toBe('products/cafeteras/cafeteras1.jpeg');
  });
});
```

(`validCreateProductInput` is the fixture already used by that file â€” reuse it, do not
re-declare it.)

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/domain test -- product.test`
Expected: FAIL â€” `image` is a required `string`, so `undefined` is a type error and
`product.image` is `undefined`, not `null`.

- [x] **Step 3: Write the implementation**

In `templates/packages/domain/src/product/product.ts`:

```ts
// line ~28, in `Product`
  readonly image: string | null;

// line ~53, in `CreateProductInput`
  readonly image?: string | null;

// line ~141, in `createProduct`
    image: input.image ?? null,
```

Then update the Prisma product mapper in `templates/packages/infra-db/src/product/` so the
row's `image` passes through unchanged (it is already `string | null` after 3.1 â€” remove any
non-null assertion or `?? ''` fallback the compiler now flags).

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @store-mgmt/domain test && pnpm --filter @store-mgmt/infra-db typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/packages/domain/src/product templates/packages/infra-db/src/product
git commit -m "feat(domain): make Product.image optional, defaulting to null"
```

---

## Phase 4 â€” `apps/api-salesops`: contracts and endpoints

### Task 4.1: Reject upload-minted refs in create and update bodies

**Files:**
- Create: `templates/apps/api-salesops/src/image/assert-not-minted-ref.ts`
- Create: `templates/apps/api-salesops/src/image/assert-not-minted-ref.spec.ts`
- Modify: `templates/apps/api-salesops/src/product/product.controller.ts`, `src/product/dto/create-product.dto.ts`, `src/product/dto/product-response.dto.ts`
- Modify: `templates/apps/api-salesops/src/category/category.controller.ts`

**Interfaces:**
- Consumes: `isUploadMintedRef`, `ImageCollection` from `@store-mgmt/domain`.
- Produces: `assertNotMintedRef(image: string | null | undefined, collection: ImageCollection): void` â€” throws `BadRequestException`.

- [x] **Step 1: Write the failing test**

Create `templates/apps/api-salesops/src/image/assert-not-minted-ref.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { assertNotMintedRef } from './assert-not-minted-ref.js';

describe('assertNotMintedRef', () => {
  it('rejects a ref shaped like one the store minted', () => {
    expect(() =>
      assertNotMintedRef('products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'products'),
    ).toThrow(BadRequestException);
  });

  it('allows a seeded catalogue ref â€” the deliberate escape hatch', () => {
    expect(() =>
      assertNotMintedRef('products/cafeteras/cafeteras1.jpeg', 'products'),
    ).not.toThrow();
  });

  it('allows an absent image', () => {
    expect(() => assertNotMintedRef(undefined, 'products')).not.toThrow();
    expect(() => assertNotMintedRef(null, 'products')).not.toThrow();
  });

  it('scopes the check to the collection it was given', () => {
    expect(() =>
      assertNotMintedRef('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp', 'categories'),
    ).toThrow(BadRequestException);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/api-salesops test -- assert-not-minted-ref`
Expected: FAIL â€” module not found.

- [x] **Step 3: Write the implementation**

Create `templates/apps/api-salesops/src/image/assert-not-minted-ref.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { isUploadMintedRef, type ImageCollection } from '@store-mgmt/domain';

/**
 * design.md D4 â€” only the upload endpoint may assign an upload-minted ref.
 *
 * Removing the admin's free-text field closes this hole in the UI but not in
 * the API: any holder of a valid token could still POST another row's minted
 * ref and alias the file, so a later replace or remove would destroy an image
 * that is still in use elsewhere. `isUploadMintedRef` is the same predicate the
 * destructive paths are gated on, so the writer and the deleter agree by
 * construction.
 *
 * This app installs NO global `ValidationPipe` and its DTO classes are erased
 * at runtime, so body validation is written by hand at the controller, the same
 * way `src/delivery/request-validation.ts` does it.
 *
 * Non-minted refs stay accepted: that is the deliberate escape hatch for seeded
 * catalogues (`products/cafeteras/cafeteras1.jpeg`).
 */
export function assertNotMintedRef(
  image: string | null | undefined,
  collection: ImageCollection,
): void {
  if (isUploadMintedRef(image, collection)) {
    throw new BadRequestException(
      `"image" cannot be set to an uploaded image ref. Use POST /${collection}/:id/image.`,
    );
  }
}
```

In `src/product/dto/create-product.dto.ts` make the field optional and document why:

```ts
  /** Optional since admin-image-crud: a product may have no image (design.md Â§3). */
  image?: string;
```

In `src/product/dto/product-response.dto.ts` widen the response field:

```ts
  image!: string | null;
```

In `product.controller.ts`, replace the local `UPLOAD_MINTED_REF` constant and
`isUploadMintedRef` function with an import, and call the guard in `create` and `update`:

```ts
import { assertNotMintedRef } from '../image/assert-not-minted-ref.js';
import { isUploadMintedRef } from '@store-mgmt/domain';

// in create(), after the currency assertions:
    assertNotMintedRef(body.image, 'products');

// in update(), first line of the method body:
    assertNotMintedRef(body.image, 'products');

// in uploadImage(), the cleanup gate now names its collection:
        if (isUploadMintedRef(previousRef, 'products') && previousRef !== ref) {
```

Do the same in `category.controller.ts`'s `create` and `update` with `'categories'`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @store-mgmt/api-salesops test -- assert-not-minted-ref product.controller category.controller`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/api-salesops/src/image templates/apps/api-salesops/src/product templates/apps/api-salesops/src/category
git commit -m "feat(api-salesops): reject upload-minted image refs in create and update bodies"
```

---

### Task 4.2: `GET /products/:id/image` â€” the admin read

**Files:**
- Create: `templates/apps/api-salesops/src/image/stream-image.ts`
- Modify: `templates/apps/api-salesops/src/product/product.controller.ts`
- Modify: `templates/apps/api-salesops/src/product/product.controller.spec.ts`

**Interfaces:**
- Consumes: `IImageStore`, `assertImageRef` from `@store-mgmt/domain`.
- Produces: `streamImage(store: IImageStore, companyId: string, ref: string | null, res: Response): Promise<StreamableFile>` â€” throws `NotFoundException` when the ref is absent, malformed, or resolves to no bytes.

- [x] **Step 1: Write the failing test**

Append to `templates/apps/api-salesops/src/product/product.controller.spec.ts`:

```ts
describe('GET /products/:id/image', () => {
  it('serves the bytes of an INACTIVE product â€” the public endpoint will not', async () => {
    productService.findById.mockResolvedValue({
      ...existingProduct,
      active: false,
      image: 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    });
    imageStore.open.mockResolvedValue({
      stream: Readable.from([Buffer.from([1, 2, 3])]),
      contentType: 'image/webp',
      byteLength: 3,
    });

    const result = await controller.getImage('product-1', request, response);

    expect(result).toBeInstanceOf(StreamableFile);
    expect(imageStore.open).toHaveBeenCalledWith('company-1', 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp');
  });

  it('sets a private, no-store cache header so a replace is visible immediately', async () => {
    productService.findById.mockResolvedValue({
      ...existingProduct,
      image: 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    });
    imageStore.open.mockResolvedValue({
      stream: Readable.from([Buffer.from([1])]),
      contentType: 'image/webp',
      byteLength: 1,
    });

    await controller.getImage('product-1', request, response);

    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('404s when the product has no image', async () => {
    productService.findById.mockResolvedValue({ ...existingProduct, image: null });

    await expect(controller.getImage('product-1', request, response)).rejects.toThrow(
      NotFoundException,
    );
    expect(imageStore.open).not.toHaveBeenCalled();
  });

  it('404s when the row points at bytes that are gone', async () => {
    productService.findById.mockResolvedValue({
      ...existingProduct,
      image: 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    });
    imageStore.open.mockResolvedValue(null);

    await expect(controller.getImage('product-1', request, response)).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

Add to that spec's setup, alongside the existing mocks:

```ts
const response = { setHeader: jest.fn(), status: jest.fn() } as unknown as Response;
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/api-salesops test -- product.controller`
Expected: FAIL â€” `controller.getImage is not a function`.

- [x] **Step 3: Write the implementation**

Create `templates/apps/api-salesops/src/image/stream-image.ts`:

```ts
import { NotFoundException, StreamableFile } from '@nestjs/common';
import { assertImageRef, type IImageStore } from '@store-mgmt/domain';
import type { Response } from 'express';
import { Readable } from 'node:stream';

/**
 * design.md D5 â€” the ADMIN read path, shared by the product and category
 * controllers.
 *
 * Deliberately NOT the public one: `api-public`'s image controller refuses to
 * serve an inactive row's image, and the admin list shows soft-deleted rows on
 * purpose, so reusing it would render broken exactly the rows an operator is
 * trying to inspect or restore. There is no content-derived cache key here
 * either â€” an operator who just replaced an image must see the new bytes on the
 * next paint, which is the opposite of the public path's immutability.
 *
 * Bytes are streamed, never buffered. Every rejection is a 404: absent ref,
 * malformed ref, and missing file are indistinguishable to the caller.
 */
export async function streamImage(
  store: IImageStore,
  companyId: string,
  ref: string | null | undefined,
  res: Response,
): Promise<StreamableFile> {
  if (typeof ref !== 'string') {
    throw new NotFoundException('Not Found');
  }

  try {
    assertImageRef(ref);
  } catch {
    throw new NotFoundException('Not Found');
  }

  const content = await store.open(companyId, ref);
  if (!content) {
    throw new NotFoundException('Not Found');
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200);

  return new StreamableFile(Readable.from(content.stream), {
    type: content.contentType,
    length: content.byteLength,
  });
}
```

Add to `ProductController` (imports: `Res`, `StreamableFile` from `@nestjs/common`,
`Response` from `express`, `streamImage` from `../image/stream-image.js`):

```ts
  /**
   * Admin image read (design.md D5). Any authenticated member may read; this
   * mirrors the rest of the catalogue, where reads are open and writes are
   * owner/admin-only. Unlike `GET /public/products/:id/image/:key`, this
   * serves inactive rows.
   */
  @Get(':id/image')
  async getImage(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.productService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Product "${id}" not found`);
      }
      return streamImage(this.imageStore, req.tenant.companyId, existing.image, res);
    });
  }
```

Rename the injected field in the constructor from `productImageStore` to `imageStore` and
retarget the token:

```ts
    @Inject(IMAGE_STORE) private readonly imageStore: IImageStore,
```

Update the two existing `this.productImageStore` call sites in `uploadImage`, and add
`collection: 'products'` to its `put` call:

```ts
        const ref = await this.imageStore.put({
          companyId: req.tenant.companyId,
          collection: 'products',
          bytes: normalized.bytes,
          declaredMimeType: normalized.contentType,
        });
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @store-mgmt/api-salesops test -- product.controller`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/api-salesops/src/image templates/apps/api-salesops/src/product
git commit -m "feat(api-salesops): serve product images to the admin, including inactive rows"
```

---

### Task 4.3: `DELETE /products/:id/image` â€” remove

**Files:**
- Modify: `templates/apps/api-salesops/src/product/product.controller.ts`
- Modify: `templates/apps/api-salesops/src/product/product.controller.spec.ts`

**Interfaces:**
- Consumes: `isUploadMintedRef`, `IImageStore.delete`, `ProductService.update`.
- Produces: `ProductController.removeImage(id, req): Promise<ProductResponseDto>`.

- [x] **Step 1: Write the failing test**

Append to `product.controller.spec.ts`:

```ts
describe('DELETE /products/:id/image', () => {
  const mintedRef = 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp';

  it('nulls the column and then deletes the minted bytes â€” in that order', async () => {
    const calls: string[] = [];
    productService.findById.mockResolvedValue({ ...existingProduct, image: mintedRef });
    productService.update.mockImplementation(async () => {
      calls.push('update');
      return { ...existingProduct, image: null };
    });
    imageStore.delete.mockImplementation(async () => {
      calls.push('delete');
    });

    const result = await controller.removeImage('product-1', request);

    expect(productService.update).toHaveBeenCalledWith('product-1', { image: null });
    expect(imageStore.delete).toHaveBeenCalledWith('company-1', mintedRef);
    expect(calls).toEqual(['update', 'delete']);
    expect(result.image).toBeNull();
  });

  it('never deletes a seeded ref the store did not mint', async () => {
    productService.findById.mockResolvedValue({
      ...existingProduct,
      image: 'products/cafeteras/cafeteras1.jpeg',
    });
    productService.update.mockResolvedValue({ ...existingProduct, image: null });

    await controller.removeImage('product-1', request);

    expect(productService.update).toHaveBeenCalledWith('product-1', { image: null });
    expect(imageStore.delete).not.toHaveBeenCalled();
  });

  it('succeeds when cleanup fails â€” the row is already updated', async () => {
    productService.findById.mockResolvedValue({ ...existingProduct, image: mintedRef });
    productService.update.mockResolvedValue({ ...existingProduct, image: null });
    imageStore.delete.mockRejectedValue(new Error('EACCES'));

    await expect(controller.removeImage('product-1', request)).resolves.toMatchObject({
      image: null,
    });
  });

  it('404s for a product that does not exist', async () => {
    productService.findById.mockResolvedValue(null);

    await expect(controller.removeImage('nope', request)).rejects.toThrow(NotFoundException);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/api-salesops test -- product.controller`
Expected: FAIL â€” `controller.removeImage is not a function`.

- [x] **Step 3: Write the implementation**

Add to `ProductController`:

```ts
  /**
   * Removes a product's image (design.md D7). Same post-commit ordering as a
   * replace: the row stops pointing at the file BEFORE the bytes go, so a
   * failed update can never leave a row pointing at something deleted. Only
   * upload-minted refs are removed from disk â€” a seeded ref may be shared by
   * other rows and we cannot prove otherwise.
   */
  @Delete(':id/image')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async removeImage(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<ProductResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const existing = await this.productService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Product "${id}" not found`);
      }

      const previousRef = existing.image;
      const updated = await this.productService.update(id, { image: null });

      if (isUploadMintedRef(previousRef, 'products')) {
        try {
          await this.imageStore.delete(req.tenant.companyId, previousRef);
        } catch (err) {
          this.logger.warn(
            `IMAGE_CLEANUP_FAILED: company ${req.tenant.companyId}, product ${id}, ref ${previousRef}: ${String(err)}`,
          );
        }
      }

      return updated;
    });
  }
```

`UpdateProductDto.image` must accept `null` â€” widen it to `image?: string | null;` and make
`ProductService.update` pass `null` through (it already patches only when the key is
present; confirm the `patch.image !== undefined` guard at `product.service.ts:104` lets
`null` through, since `null !== undefined`).

Also rename the existing `PRODUCT_IMAGE_CLEANUP_FAILED` log prefix in `uploadImage` to
`IMAGE_CLEANUP_FAILED` so both paths emit one searchable token.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @store-mgmt/api-salesops test -- product.controller`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/api-salesops/src/product
git commit -m "feat(api-salesops): let an admin remove a product image"
```

---

### Task 4.4: Category image endpoints

**Files:**
- Modify: `templates/apps/api-salesops/src/category/category.controller.ts`
- Modify: `templates/apps/api-salesops/src/category/category.module.ts`
- Modify: `templates/apps/api-salesops/src/category/category.controller.spec.ts`

**Interfaces:**
- Consumes: `streamImage` (4.2), `assertNotMintedRef` (4.1), `normalizeImage`, `IImageStore`.
- Produces: `CategoryController.getImage`, `.uploadImage`, `.removeImage` â€” same signatures and semantics as the product ones, with `'categories'` as the collection.

- [x] **Step 1: Write the failing test**

Append to `category.controller.spec.ts` (mirror the three product blocks from 4.2 and 4.3,
swapping the collection). The one category-specific case that must be present:

```ts
describe('POST /categories/:id/image', () => {
  it('mints under the categories collection, not products', async () => {
    categoryService.findById.mockResolvedValue({ ...existingCategory, image: null });
    imageStore.put.mockResolvedValue('categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp');
    categoryService.update.mockResolvedValue({
      ...existingCategory,
      image: 'categories/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp',
    });

    await controller.uploadImage('category-1', file, request);

    expect(imageStore.put).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'categories', companyId: 'company-1' }),
    );
  });

  it('deletes the replaced file only after the update commits', async () => {
    const previous = 'categories/11111111-1111-1111-1111-111111111111.webp';
    const calls: string[] = [];
    categoryService.findById.mockResolvedValue({ ...existingCategory, image: previous });
    imageStore.put.mockResolvedValue('categories/22222222-2222-2222-2222-222222222222.webp');
    categoryService.update.mockImplementation(async () => {
      calls.push('update');
      return { ...existingCategory, image: 'categories/22222222-2222-2222-2222-222222222222.webp' };
    });
    imageStore.delete.mockImplementation(async () => {
      calls.push('delete');
    });

    await controller.uploadImage('category-1', file, request);

    expect(calls).toEqual(['update', 'delete']);
    expect(imageStore.delete).toHaveBeenCalledWith('company-1', previous);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/api-salesops test -- category.controller`
Expected: FAIL â€” `controller.uploadImage is not a function`.

- [x] **Step 3: Write the implementation**

Wire the store into `category.module.ts`:

```ts
import { InfraStorageModule } from '@store-mgmt/infra-storage';

@Module({
  imports: [InfraDbModule, InfraStorageModule],
  // ...unchanged...
})
```

Inject it in `CategoryController`'s constructor exactly as the product one does
(`@Inject(IMAGE_STORE) private readonly imageStore: IImageStore`), add
`private readonly logger = new Logger(CategoryController.name);`, and copy the three
endpoints from `ProductController` â€” `getImage`, `uploadImage`, `removeImage` â€” changing:

- the service calls to `this.categoryService.*`
- the not-found message to `Category "${id}" not found`
- every `'products'` collection literal to `'categories'`
- the log line's entity word to `category`

Reuse the SAME upload validators as the product controller by exporting them from
`src/image/`: move `MAX_PRODUCT_IMAGE_SIZE_BYTES` â†’ `MAX_IMAGE_SIZE_BYTES` and
`ALLOWED_PRODUCT_IMAGE_MIME_TYPES` â†’ `ALLOWED_IMAGE_MIME_TYPES` into a new
`src/image/upload-constraints.ts`, keeping their existing doc comments verbatim, and import
them in both controllers. Two controllers must not carry two copies of an allowlist.

- [x] **Step 4: Run the app's full suite**

Run: `pnpm --filter @store-mgmt/api-salesops typecheck && pnpm --filter @store-mgmt/api-salesops test:cov && pnpm --filter @store-mgmt/api-salesops test:e2e`
Expected: PASS, coverage at or above the frozen threshold.

- [x] **Step 5: Commit**

```bash
git add templates/apps/api-salesops/src
git commit -m "feat(api-salesops): add category image read, upload and remove endpoints"
```

---

## Phase 5 â€” `apps/api-public`: a product may have no URL

### Task 5.1: `imageUrl` becomes nullable

**Files:**
- Modify: `templates/apps/api-public/src/product/to-public-product-dto.ts:26`
- Modify: `templates/apps/api-public/src/product/dto/public-product.dto.ts`
- Modify: `templates/apps/api-public/src/product/product-image.controller.ts` (import renames only)
- Modify: `templates/apps/api-public/src/product/public-product.module.ts` (token rename)
- Modify: `templates/apps/api-public/src/product/to-public-product-dto.spec.ts`

**Interfaces:**
- Consumes: `Product.image: string | null` (3.2), `IMAGE_STORE` (1.1).
- Produces: `PublicProductDto.imageUrl: string | null`.

- [x] **Step 1: Write the failing test**

Append to `to-public-product-dto.spec.ts`:

```ts
it('returns a null imageUrl for a product with no image', () => {
  const dto = toPublicProductDto(
    { product: { ...baseProduct, image: null }, finalPrice: baseProduct.price },
    'remeras',
  );

  expect(dto.imageUrl).toBeNull();
});

it('still assembles a URL when the product has an image', () => {
  const dto = toPublicProductDto(
    { product: { ...baseProduct, image: 'products/x.webp' }, finalPrice: baseProduct.price },
    'remeras',
  );

  expect(dto.imageUrl).toContain(`/public/products/${baseProduct.id}/image/`);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @store-mgmt/api-public test -- to-public-product-dto`
Expected: FAIL â€” `imageUrl` is a URL string built from `null`, not `null`.

- [x] **Step 3: Write the implementation**

In `dto/public-product.dto.ts`:

```ts
  /** `null` when the product has no image â€” the client renders a placeholder (design.md D8). */
  readonly imageUrl: string | null;
```

In `to-public-product-dto.ts:26`:

```ts
    imageUrl: product.image === null ? null : assemblePublicImageUrl(product.id, product.image),
```

In `product-image.controller.ts` and `public-product.module.ts`, rename the imports only:
`PRODUCT_IMAGE_STORE` â†’ `IMAGE_STORE`, `IProductImageStore` â†’ `IImageStore`,
`assertProductImageRef` â†’ `assertImageRef`, and the injected field to `imageStore`. The
controller's `isValidRef` already guards a `string`; add the null check at its call site:

```ts
      const ref = item.product.image;
      if (ref === null || !this.isValidRef(ref, id)) {
        throw notFound();
      }
```

- [x] **Step 4: Run the app's full suite**

Run: `pnpm --filter @store-mgmt/api-public typecheck && pnpm --filter @store-mgmt/api-public test:cov`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/api-public/src
git commit -m "feat(api-public): return a null imageUrl for products with no image"
```

---

## Phase 6 â€” `apps/web-catalog`: placeholder, proxy, and both CRUDs

### Task 6.1: One placeholder, used by the storefront

**Files:**
- Create: `templates/apps/web-catalog/app/shared/components/image-placeholder.tsx`
- Create: `templates/apps/web-catalog/app/shared/components/__tests__/image-placeholder.test.tsx`
- Modify: `templates/apps/web-catalog/app/catalog/components/product-card.tsx:27-33`
- Modify: `templates/apps/web-catalog/app/catalog/routes/product-detail.tsx:48`
- Modify: `templates/apps/web-catalog/app/shared/lib/public-api.types.ts:31`

**Interfaces:**
- Consumes: `PublicProductDto.imageUrl: string | null` (5.1).
- Produces: `<ProductImage src={string | null} alt={string} className={string} />` â€” renders an `<img>` when `src` is a string, an inline-SVG placeholder in the same box otherwise.

- [x] **Step 1: Write the failing test**

Create `templates/apps/web-catalog/app/shared/components/__tests__/image-placeholder.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from '../image-placeholder';

describe('ProductImage', () => {
  it('renders the image when a src is given', () => {
    render(<ProductImage src="/img/x.webp" alt="Remera" className="h-64" />);

    expect(screen.getByRole('img', { name: 'Remera' })).toHaveAttribute('src', '/img/x.webp');
  });

  it('renders a placeholder with the same className when src is null', () => {
    const { container } = render(<ProductImage src={null} alt="Remera" className="h-64" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('h-64');
  });

  it('labels the placeholder for assistive tech', () => {
    render(<ProductImage src={null} alt="Remera" className="h-64" />);

    expect(screen.getByLabelText('Remera (sin imagen)')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- image-placeholder`
Expected: FAIL â€” cannot resolve `../image-placeholder`.

- [x] **Step 3: Write the implementation**

Create `templates/apps/web-catalog/app/shared/components/image-placeholder.tsx`:

```tsx
export interface ProductImageProps {
  /** `null` when the row has no image â€” see design.md D8. */
  src: string | null;
  alt: string;
  /** Sizing classes. Applied to the image AND the placeholder, so the box never moves. */
  className?: string;
}

/**
 * One image element for the whole app (design.md D8). The placeholder is an
 * inline SVG in the SAME box as the real image: no network request, no 404
 * round-trip, no layout shift, and no broken-image glyph. Used by the
 * storefront card and detail, and by both admin lists and forms, so "no image"
 * looks deliberate everywhere instead of accidental in each place.
 */
export function ProductImage({ src, alt, className = '' }: ProductImageProps) {
  if (src !== null) {
    return <img src={src} alt={alt} className={className} />;
  }

  return (
    <div
      role="img"
      aria-label={`${alt} (sin imagen)`}
      className={`flex items-center justify-center bg-background ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
        className="h-1/3 w-1/3 text-text-muted opacity-40"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    </div>
  );
}
```

In `product-card.tsx`, replace the `<img>` with:

```tsx
        <ProductImage
          src={item.imageUrl}
          alt={item.name}
          className="w-full h-64 object-cover transition-transform duration-300 group-hover:scale-105"
        />
```

Apply the same substitution in `product-detail.tsx:48`, keeping that element's own classes.
In `public-api.types.ts:31`, widen `readonly imageUrl: string;` to `readonly imageUrl: string | null;`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web-catalog test -- image-placeholder product-card product-detail`
Expected: PASS. The existing card/detail tests must still pass unchanged â€” if one asserts on
`img` for a product WITH an image, it keeps working.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/shared/components templates/apps/web-catalog/app/catalog
git commit -m "feat(web-catalog): render a placeholder for products with no image"
```

---

### Task 6.2: The admin image proxy routes

**Files:**
- Create: `templates/apps/web-catalog/app/admin/routes/productos/image.tsx`
- Create: `templates/apps/web-catalog/app/admin/routes/categorias/image.tsx`
- Create: `templates/apps/web-catalog/app/admin/routes/productos/__tests__/image.test.tsx`
- Modify: `templates/apps/web-catalog/app/routes.ts`
- Modify: `templates/apps/web-catalog/app/admin/lib/products.server.ts`, `categories.server.ts`
- Modify: `templates/apps/web-catalog/app/admin/lib/admin-api.types.ts`

**Interfaces:**
- Consumes: `withAuth`, `makeAuthenticatedRequest`.
- Produces: routes `/admin/productos/:id/image` and `/admin/categorias/:id/image`;
  `fetchProductImage(request, companyId, id): Promise<Response>`,
  `fetchCategoryImage(...)`, `deleteProductImage(...)`, `deleteCategoryImage(...)`,
  `uploadCategoryImage(request, companyId, id, formData)`.
  `AdminProductDto.image` and `CreateProductInput.image` become `string | null` / optional.

- [x] **Step 1: Write the failing test**

Create `templates/apps/web-catalog/app/admin/routes/productos/__tests__/image.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';

const makeAuthenticatedRequest = vi.fn();
vi.mock('../../../../shared/lib/api.server', () => ({ makeAuthenticatedRequest }));
vi.mock('../../../../shared/lib/auth.guards.server', () => ({
  withAuth:
    (fn: (args: { request: Request; params: Record<string, string>; companyId: string }) => unknown) =>
    (args: { request: Request; params: Record<string, string> }) =>
      fn({ ...args, companyId: 'company-1' }),
}));

const { loader } = await import('../image');

describe('GET /admin/productos/:id/image', () => {
  it('proxies the upstream bytes and content type without exposing the token', async () => {
    makeAuthenticatedRequest.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      }),
    );

    const response = (await loader({
      request: new Request('http://x/admin/productos/p1/image'),
      params: { id: 'p1' },
    } as never)) as Response;

    expect(makeAuthenticatedRequest).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      '/products/p1/image',
    );
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Authorization')).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('passes an upstream 404 through as a 404', async () => {
    makeAuthenticatedRequest.mockResolvedValue(new Response(null, { status: 404 }));

    const response = (await loader({
      request: new Request('http://x/admin/productos/p1/image'),
      params: { id: 'p1' },
    } as never)) as Response;

    expect(response.status).toBe(404);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- productos/__tests__/image`
Expected: FAIL â€” cannot resolve `../image`.

- [x] **Step 3: Write the implementation**

Create `templates/apps/web-catalog/app/admin/routes/productos/image.tsx`:

```tsx
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { fetchProductImage } from '../../lib/products.server';

/**
 * Resource route: the browser's `<img src>` for an admin thumbnail
 * (design.md D5b).
 *
 * The `<img>` runs in the browser, which holds this app's session cookie and
 * NO Bearer token. Pointing it straight at `api-salesops` would either 401 or
 * force us to ship the token to the client â€” strictly worse than the problem
 * it solves. So the fetch happens here, server-side, and only a same-origin URL
 * ever reaches the page.
 *
 * This route holds no authorization policy of its own: `withAuth` resolves
 * WHICH company the request is for, and `api-salesops`'s guard chain
 * independently re-checks membership on every call.
 */
export const loader = withAuth(async ({ request, params, companyId }) => {
  const upstream = await fetchProductImage(request, companyId, params.id!);

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
    },
  });
});
```

Create the categorias twin, importing `fetchCategoryImage` and hitting `/categories/:id/image`.

Add to `products.server.ts`:

```ts
/** Raw upstream `Response` â€” the proxy route (D5b) streams its body straight through. */
export async function fetchProductImage(
  request: Request,
  companyId: string,
  id: string,
): Promise<Response> {
  return makeAuthenticatedRequest(request, companyId, `/products/${encodeURIComponent(id)}/image`);
}

export async function deleteProductImage(
  request: Request,
  companyId: string,
  id: string,
): Promise<AdminProductDto> {
  const response = await makeAuthenticatedRequest(
    request,
    companyId,
    `/products/${encodeURIComponent(id)}/image`,
    { method: 'DELETE' },
  );
  return parseOrThrow(response);
}
```

Add the category equivalents to `categories.server.ts`, plus `uploadCategoryImage` copied
from `uploadProductImage` (keeping its "no `Content-Type` header" doc comment â€” the reason
applies identically).

In `admin-api.types.ts`: `AdminProductDto.image: string | null`, `CreateProductInput.image?: string`.

Register both routes in `app/routes.ts`, inside the `_auth.tsx` layout block:

```ts
    route('admin/productos/:id/image', 'admin/routes/productos/image.tsx'),
    route('admin/categorias/:id/image', 'admin/routes/categorias/image.tsx'),
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web-catalog test -- image && pnpm --filter web-catalog typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/admin templates/apps/web-catalog/app/routes.ts
git commit -m "feat(web-catalog): proxy admin image bytes through a guarded resource route"
```

---

### Task 6.3: The product form picks a file instead of a path

**Files:**
- Modify: `templates/apps/web-catalog/app/admin/components/product-form.tsx:12-18,174-184`
- Modify: `templates/apps/web-catalog/app/admin/routes/productos/nuevo.tsx:19-62`
- Modify: `templates/apps/web-catalog/app/admin/routes/productos/__tests__/nuevo.test.tsx`

**Interfaces:**
- Consumes: `createProduct`, `uploadProductImage` (existing), `ProductImage` (6.1).
- Produces: `ProductForm` with no `image` text input and a new `mode: 'create' | 'edit'` prop; `parseProductFormData(formData)` no longer reads `image`.

- [x] **Step 1: Write the failing test**

Replace the image-related cases in `productos/__tests__/nuevo.test.tsx` with:

```tsx
describe('ProductForm â€” image', () => {
  it('offers a file picker, not a raw path field', () => {
    render(<ProductForm mode="create" categories={[category]} submitLabel="Crear" />);

    const input = screen.getByLabelText('Imagen (opcional)') as HTMLInputElement;

    expect(input.type).toBe('file');
    expect(input.required).toBe(false);
    expect(screen.queryByPlaceholderText('products/remera.jpg')).not.toBeInTheDocument();
  });

  it('does not render an image control at all in edit mode', () => {
    render(
      <ProductForm mode="edit" categories={[category]} submitLabel="Guardar" defaultValues={product} />,
    );

    expect(screen.queryByLabelText('Imagen (opcional)')).not.toBeInTheDocument();
  });
});

describe('parseProductFormData', () => {
  it('never carries image â€” the upload endpoint owns it', () => {
    const formData = new FormData();
    formData.set('name', 'Remera');
    formData.set('description', 'x');
    formData.set('categoryId', 'cat-1');
    formData.set('order', '1');
    formData.set('priceAmount', '100.00');
    formData.set('priceCurrency', 'USD');
    formData.set('costAmount', '50.00');
    formData.set('costCurrency', 'USD');
    formData.set('image', 'products/3fa85f64-5717-4562-b3fc-2c963f66afa6.webp');

    expect(parseProductFormData(formData)).not.toHaveProperty('image');
  });
});

describe('action â€” create then upload', () => {
  it('creates the product first, then uploads the chosen file to its id', async () => {
    const calls: string[] = [];
    createProduct.mockImplementation(async () => {
      calls.push('create');
      return { ...product, id: 'new-id' };
    });
    uploadProductImage.mockImplementation(async () => {
      calls.push('upload');
      return product;
    });

    await action({ request: requestWith(formDataWithFile()) } as never);

    expect(calls).toEqual(['create', 'upload']);
    expect(uploadProductImage).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      'new-id',
      expect.any(FormData),
    );
  });

  it('does not call upload when no file was chosen', async () => {
    createProduct.mockResolvedValue({ ...product, id: 'new-id' });

    await action({ request: requestWith(formDataWithoutFile()) } as never);

    expect(uploadProductImage).not.toHaveBeenCalled();
  });

  it('keeps the created product when the upload fails, and says so', async () => {
    createProduct.mockResolvedValue({ ...product, id: 'new-id' });
    uploadProductImage.mockRejectedValue(new Response(null, { status: 400 }));

    const result = await action({ request: requestWith(formDataWithFile()) } as never);

    expect(result).toEqual({
      error: 'El producto se creÃ³, pero la imagen no se pudo subir. PodÃ©s subirla desde la ediciÃ³n.',
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- productos/__tests__/nuevo`
Expected: FAIL â€” `ProductForm` has no `mode` prop and still renders the text input.

- [x] **Step 3: Write the implementation**

In `product-form.tsx`, add `mode` to the props, replace the doc comment's stale note about
task 6.7, and swap the image block:

```tsx
export interface ProductFormProps {
  /** `create` shows the file picker; `edit` has its own upload form beside this one. */
  mode: 'create' | 'edit';
  categories: AdminCategoryDto[];
  submitLabel: string;
  error?: string;
  defaultValues?: Partial<AdminProductDto>;
}

// replacing the old `image` text input entirely:
        {mode === 'create' && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-text">Imagen (opcional)</span>
            <input name="imageFile" type="file" accept="image/*" className="text-sm text-text" />
          </label>
        )}
```

The create form must be `<Form method="post" encType="multipart/form-data">` in `nuevo.tsx`.

In `nuevo.tsx`, drop `image` from `parseProductFormData`'s returned object, and rewrite the
action:

```tsx
export const action = withAuth(async ({ request, companyId }) => {
  const formData = await request.formData();
  const input = parseProductFormData(formData);

  let created: AdminProductDto;
  try {
    created = await createProduct(request, companyId, input);
  } catch (err) {
    if (err instanceof Response) {
      return { error: productErrorMessage(err.status) };
    }
    throw err;
  }

  // design.md D6 â€” create first, then upload against the id we just got. If the
  // upload fails the row still exists WITHOUT an image, which is a legal state
  // since admin-image-crud; we say so instead of pretending the create failed.
  const file = formData.get('imageFile');
  if (file instanceof File && file.size > 0) {
    const uploadFormData = new FormData();
    uploadFormData.set('image', file);
    try {
      await uploadProductImage(request, companyId, created.id, uploadFormData);
    } catch {
      return {
        error: 'El producto se creÃ³, pero la imagen no se pudo subir. PodÃ©s subirla desde la ediciÃ³n.',
      };
    }
  }

  return redirect('/admin/productos');
});
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web-catalog test -- productos`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/admin
git commit -m "feat(web-catalog): pick an image file when creating a product"
```

---

### Task 6.4: The edit screen shows, replaces and removes

**Files:**
- Modify: `templates/apps/web-catalog/app/admin/routes/productos/editar.tsx`
- Modify: `templates/apps/web-catalog/app/admin/routes/productos/__tests__/editar.test.tsx`

**Interfaces:**
- Consumes: `deleteProductImage` (6.2), `ProductImage` (6.1), the `/admin/productos/:id/image` route (6.2).
- Produces: an edit page with an image panel â€” thumbnail, replace, remove â€” and an `intent=remove-image` action branch.

- [x] **Step 1: Write the failing test**

Append to `productos/__tests__/editar.test.tsx`:

```tsx
describe('image panel', () => {
  it('shows the current image through the proxy route, not the raw ref', () => {
    render(<EditarProductoPage product={{ ...product, image: 'products/x.webp' }} categories={[category]} />);

    expect(screen.getByRole('img', { name: product.name })).toHaveAttribute(
      'src',
      `/admin/productos/${product.id}/image`,
    );
    expect(screen.queryByText('products/x.webp')).not.toBeInTheDocument();
  });

  it('shows the placeholder and no remove button when there is no image', () => {
    render(<EditarProductoPage product={{ ...product, image: null }} categories={[category]} />);

    expect(screen.getByLabelText(`${product.name} (sin imagen)`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar imagen' })).not.toBeInTheDocument();
  });

  it('offers removal when there is an image', () => {
    render(<EditarProductoPage product={{ ...product, image: 'products/x.webp' }} categories={[category]} />);

    expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeInTheDocument();
  });
});

describe('action', () => {
  it('removes the image on intent=remove-image and returns to this page', async () => {
    const formData = new FormData();
    formData.set('intent', 'remove-image');

    const result = await action({
      request: requestWith(formData),
      params: { id: 'p1' },
    } as never);

    expect(deleteProductImage).toHaveBeenCalledWith(expect.anything(), 'company-1', 'p1');
    expect(result.headers.get('Location')).toBe('/admin/productos/p1/editar');
  });

  it('does not send image in the update payload â€” a field edit cannot revert the photo', async () => {
    const formData = fullProductFormData();
    formData.set('image', 'products/attacker-chosen.webp');

    await action({ request: requestWith(formData), params: { id: 'p1' } } as never);

    expect(updateProduct).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      'p1',
      expect.not.objectContaining({ image: expect.anything() }),
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- productos/__tests__/editar`
Expected: FAIL â€” no image panel, no `remove-image` branch.

- [x] **Step 3: Write the implementation**

Add the action branch beside the existing `delete` and `upload-image` ones:

```tsx
    } else if (intent === 'remove-image') {
      await deleteProductImage(request, companyId, id);
      return redirect(`/admin/productos/${id}/editar`);
```

Pass `mode="edit"` to `<ProductForm>`, and replace the upload `<Form>`'s
`Imagen actual: {product.image}` line with the panel:

```tsx
        <div className="mb-4 bg-surface border border-border rounded-lg p-6">
          <span className="text-sm font-medium text-text">Imagen del producto</span>

          <ProductImage
            src={product.image === null ? null : `/admin/productos/${product.id}/image`}
            alt={product.name}
            className="mt-3 h-40 w-40 rounded-md border border-border object-cover"
          />

          <Form method="post" encType="multipart/form-data" className="mt-4">
            <input type="hidden" name="intent" value="upload-image" />
            <input name="image" type="file" accept="image/*" required className="text-sm text-text" />
            <button
              type="submit"
              className="mt-3 block rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
            >
              {product.image === null ? 'Subir imagen' : 'Reemplazar imagen'}
            </button>
          </Form>

          {product.image !== null && (
            <Form
              method="post"
              className="mt-3"
              onSubmit={(event) => {
                if (!confirm('Â¿Quitar la imagen? El archivo se elimina y no se puede recuperar.')) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="remove-image" />
              <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-700">
                Quitar imagen
              </button>
            </Form>
          )}
        </div>
```

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web-catalog test -- productos`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/admin/routes/productos
git commit -m "feat(web-catalog): show, replace and remove a product image from the edit screen"
```

---

### Task 6.5: The same three moves for categories

**Files:**
- Modify: `templates/apps/web-catalog/app/admin/components/category-form.tsx:9-15,69-78`
- Modify: `templates/apps/web-catalog/app/admin/routes/categorias/nueva.tsx`, `editar.tsx`
- Modify: `templates/apps/web-catalog/app/admin/routes/categorias/__tests__/nueva.test.tsx`, `editar.test.tsx`

**Interfaces:**
- Consumes: `uploadCategoryImage`, `deleteCategoryImage`, `fetchCategoryImage` (6.2), `ProductImage` (6.1).
- Produces: `CategoryForm` with a `mode` prop and no `image` text input; the categorias edit route gaining `upload-image` and `remove-image` intents.

- [x] **Step 1: Write the failing test**

Mirror 6.3's and 6.4's blocks in the two categorias test files, changing the route prefix to
`/admin/categorias/`, the label to `Imagen (opcional)`, and the confirm copy. Add this
category-specific case to `nueva.test.tsx`:

```tsx
it('keeps the icon field as free text â€” it is not an uploaded image', () => {
  render(<CategoryForm mode="create" submitLabel="Crear" />);

  const icon = screen.getByLabelText('Ãcono (opcional)') as HTMLInputElement;

  expect(icon.type).toBe('text');
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- categorias`
Expected: FAIL â€” `CategoryForm` has no `mode` prop.

- [x] **Step 3: Write the implementation**

Apply 6.3's and 6.4's changes to the category form and its two routes. `icon` stays exactly
as it is (design.md Â§1, out of scope). Update the form's doc comment, which currently claims
there is "no upload UI for categories".

`parseCategoryFormData` (or the inline equivalent in `nueva.tsx`) stops emitting `image`.

- [x] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web-catalog test -- categorias`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/admin
git commit -m "feat(web-catalog): upload, replace and remove category images"
```

---

### Task 6.6: Thumbnails in both admin lists

**Files:**
- Modify: `templates/apps/web-catalog/app/admin/routes/productos/index.tsx:47-60`
- Modify: `templates/apps/web-catalog/app/admin/routes/categorias/index.tsx`
- Modify: both `__tests__/index.test.tsx`

**Interfaces:**
- Consumes: `ProductImage` (6.1), the proxy routes (6.2).
- Produces: a leading thumbnail column in both admin tables.

- [x] **Step 1: Write the failing test**

Append to `productos/__tests__/index.test.tsx`:

```tsx
describe('thumbnail column', () => {
  it('shows a thumbnail for a product with an image', () => {
    render(<ProductosAdminPage products={[{ ...product, image: 'products/x.webp' }]} categories={[category]} />);

    expect(screen.getByRole('img', { name: product.name })).toHaveAttribute(
      'src',
      `/admin/productos/${product.id}/image`,
    );
  });

  it('shows the placeholder for a product without one', () => {
    render(<ProductosAdminPage products={[{ ...product, image: null }]} categories={[category]} />);

    expect(screen.getByLabelText(`${product.name} (sin imagen)`)).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web-catalog test -- productos/__tests__/index`
Expected: FAIL â€” no image in the row.

- [x] **Step 3: Write the implementation**

Add the header cell before `Nombre`:

```tsx
                  <th className="py-2 pr-4 w-16" />
```

And the body cell as the row's first `<td>`:

```tsx
                    <td className="py-2 pr-4">
                      <ProductImage
                        src={product.image === null ? null : `/admin/productos/${product.id}/image`}
                        alt={product.name}
                        className="h-12 w-12 rounded border border-border object-cover"
                      />
                    </td>
```

Mirror it in the categorias list with `/admin/categorias/${category.id}/image` and `category.name`.

- [x] **Step 4: Run the app's full suite**

Run: `pnpm --filter web-catalog typecheck && pnpm --filter web-catalog lint && pnpm --filter web-catalog test:cov`
Expected: PASS, coverage at or above the frozen threshold.

- [x] **Step 5: Commit**

```bash
git add templates/apps/web-catalog/app/admin
git commit -m "feat(web-catalog): show image thumbnails in both admin lists"
```

---

## Phase 7 â€” Final verification

### Task 7.1: Whole-repo green and invariants held

- [x] **Step 1: Run every gate**

```bash
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm --filter @store-mgmt/api-salesops test:e2e
```

Expected: all PASS.

- [x] **Step 2: Prove the old names are gone**

```bash
grep -rn "IProductImageStore\|PRODUCT_IMAGE_STORE\|assertProductImageRef\|FsProductImageStore\|InvalidProductImageRefError" templates --include='*.ts' --include='*.tsx' | grep -v node_modules
```

Expected: no output.

- [x] **Step 3: Prove no raw-ref input survives**

```bash
grep -rn 'name="image"' templates/apps/web-catalog/app/admin --include='*.tsx' | grep -v 'type="file"'
```

Expected: no output â€” every remaining `name="image"` is a file input.

- [x] **Step 4: Prove both schemas moved together**

```bash
grep -n "image" templates/packages/infra-db/prisma/master/schema.prisma templates/packages/infra-db/prisma/tenant/schema.prisma | grep -i product -A0
grep -n "image" templates/packages/infra-db/prisma/tenant-schema.sql
```

Expected: `image String?` in both schema files; `image TEXT` with no `NOT NULL` in the SQL artifact.

- [x] **Step 5: Commit any fixes and update this file**

Check off every box above, then:

```bash
git add -A
git commit -m "chore(admin-image-crud): final verification pass"
```

---

## Self-Review Notes

Checked against `design.md` on completion of this plan:

- D1 â†’ Tasks 1.1, 1.2, 2.1, 2.2. D2 â†’ Task 1.1 (grammar unchanged, tested for both collections).
  D3 â†’ Task 1.1 (`isUploadMintedRef` moved and collection-scoped). D4 â†’ Task 4.1.
  D5 â†’ Task 4.2. D5b â†’ Task 6.2. D6 â†’ Task 6.3. D7 â†’ Tasks 4.3, 4.4. D8 â†’ Task 6.1.
- Â§3 (data model) â†’ Task 3.1. Â§4 (HTTP contract) â†’ Tasks 4.1-4.4, 5.1.
  Â§5 (admin UX) â†’ Tasks 6.3-6.6. Â§6 (testing) â†’ every task's Step 1.
- Â§7's three risks each have a guard: the rename lands as its own commit (1.2), coverage is
  checked per package as it closes (2.2, 4.4, 5.1, 6.6), and both schemas are edited in one
  task with a verification step (3.1, 7.1 Step 4).
