# Design: admin-image-crud

Branch: TBD (off `public-catalog`'s successor / `main`).
Predecessor: `openspec/changes/archive/2026-08-13-public-catalog/` — this change
closes the residual hole that change's `design.md` §9 and its follow-up memory left
open, and supersedes its D1 naming decision (see D1 below).

Authored via the **superpowers** plugin (`brainstorming` → `writing-plans`). The
`sdd-*` skills are NOT used for this change; artifacts live here, per project
convention.

## 1. The shape

Today a product image can only be set by typing a raw storage ref into a free-text
field, and the upload button exists only on the edit screen. Categories have an
`image` column and a text field, no upload path at all, and nothing that serves the
bytes. This change makes both entities behave like an ordinary CRUD with an image:
**pick a file, see it, replace it, remove it** — and makes the image optional
everywhere.

Four things change in kind, not just in degree:

1. `Product.image` stops being mandatory. A product with no image is a legal,
   first-class state, rendered with a placeholder rather than a broken box.
2. The raw storage ref stops being operator-writable. It is minted by the upload
   endpoint and by nothing else.
3. The image store stops being product-specific. One port, one adapter, two
   collections.
4. The admin gains its own authenticated image-read endpoint, because the public
   one deliberately refuses the very rows the admin most needs to see.

### Out of scope

- **Category image presentation in the storefront.** Owner decision: no changes to
  how categories are presented publicly. Category images are uploadable and visible
  **in the admin only**. `api-public`'s category payload is untouched.
- **The category `icon` field.** Stays a text input. It is not an uploaded image.
- The slug→company cache (still deferred; see the predecessor's §9 item 2).

## 2. Architecture decisions

### D1 — The port is `IImageStore`, not `IProductImageStore`. It always was.

`public-catalog`'s D1 named the port `IProductImageStore` because products were the
only consumer. Reading the adapter now, exactly **one line** is product-specific:
`FsProductImageStore.put` builds `products/${randomUUID()}.${extension}`. Path
resolution under `<base>/<companyId>/<ref>`, the ref grammar, the extension
allowlist, the traversal gate, the idempotent delete — none of it knows what a
product is. The port's own doc comment insists on stating intent "never filesystem
vocabulary"; it was already an image store wearing a product's name.

So: `IProductImageStore` → `IImageStore`, `ProductImageRef` → `ImageRef`,
`PutProductImageInput` → `PutImageInput`, `assertProductImageRef` →
`assertImageRef`, `InvalidProductImageRefError` → `InvalidImageRefError`, DI token
`PRODUCT_IMAGE_STORE` → `IMAGE_STORE`. The file moves out of
`packages/domain/src/product/` to `packages/domain/src/image/`. `put` gains a
`collection: ImageCollection` (`'products' | 'categories'`) and builds
`<collection>/<uuid>.<ext>`.

**Why now and not later.** The port has exactly four consumers today — `api-public`,
`api-salesops`, `domain`, `infra-storage` — and the rename is driven end to end by
the compiler. Verified: nothing frozen imports it (no `static-store`, no
`storefront`, no `appliances`). Once category images ship, the same rename costs a
guarded afternoon against live data. The alternative considered and rejected was a
sibling `ICategoryImageStore`: zero risk to the green product path, but ~140
duplicated lines and two copies of the traversal gate to keep in sync forever. A
security-shaped invariant that exists twice will eventually exist twice differently.

### D2 — The ref grammar does not change, and does not need to.

`PRODUCT_IMAGE_REF_PATTERN` is `/^[a-z0-9][a-z0-9/_-]*\.(webp|jpe?g|png)$/`. It
already admits `categories/remeras.jpg` and already rejects traversal (`..`),
absolute paths and backslashes by construction. Renaming the validator is the whole
change. No migration of existing refs, seeded or minted.

### D3 — "The store deletes only what the store minted" becomes a shared, public rule.

`isUploadMintedRef` is currently a private helper inside
`apps/api-salesops/src/product/product.controller.ts`. It encodes the invariant that
guards every destructive path: a ref shaped `<collection>/<uuid>.<ext>` came from
`put`, so deleting it destroys nothing a human authored. Two modules now need it, and
it is the load-bearing half of three operations (replace, remove, and the cleanup after
both). It moves to the port next to `assertImageRef`, parameterized by collection,
with its own unit tests.

### D4 — `image` is rejected in create/update bodies when it is upload-minted.

The text field going away closes the hole in the UI. It does not close it in the API:
anything holding a valid token can still `POST /products` with another product's
minted ref and alias the file, so a later replace destroys both. The invariant is
**only the upload endpoint may assign a minted ref**, and it is enforced where it
lives — in the controller, on create and on update, as a 400.

`api-salesops` installs **no global `ValidationPipe`** and its DTO classes are erased
at runtime, so this is an explicit hand-written check, following the existing
`apps/api-salesops/src/delivery/request-validation.ts` pattern. Verified safe against
existing data: the minted shape appears nowhere outside `*.spec.ts` — no seed, no
fixture, no migration uses it.

Non-minted refs stay accepted in the body. That is the deliberate escape hatch for
seeded catalogs (`products/cafeteras/cafeteras1.jpeg`), and it is the only writable
path left.

### D5 — The admin reads images from `api-salesops`, never from `api-public`.

The obvious shortcut — point the admin's `<img>` at the public URL — is wrong, and
the reason is specific rather than stylistic. `api-public`'s image controller
deliberately **refuses to serve an inactive product's image**. The admin list shows
soft-deleted rows on purpose. Reusing the public endpoint means exactly the rows an
operator is trying to inspect or restore render broken.

So `api-salesops` grows `GET /products/:id/image` and `GET /categories/:id/image`,
authenticated, behind the same tenant guard as the rest of the CRUD, with no
active-row filter. They stream through the same `IImageStore.open`, so bytes still
have exactly one reader in the codebase.

These are **admin** URLs: no content-derived cache key, no immutability. They are
`Cache-Control: private, no-store`, because an operator who just replaced an image
must see the new one immediately — the opposite of the public path's requirement.
That asymmetry is the point of having two endpoints rather than one.

### D5b — The browser reaches those bytes through a `web-catalog` resource route.

Found while planning, not while designing: D5 gives the admin an authenticated
endpoint, but the `<img>` tag that consumes it runs in the **browser**, which holds a
`web-catalog` session cookie and no Bearer token. Pointing `src` straight at
`api-salesops` would either 401 or require shipping the token to the client — the
second being strictly worse than the problem it solves.

So `web-catalog` grows two resource routes, `/admin/productos/:id/image` and
`/admin/categorias/:id/image`. Each is a loader-only route behind the same `withAuth`
guard as every other admin route: it calls `api-salesops` server-side through the
existing `makeAuthenticatedRequest`, and returns the upstream body and
`Content-Type` unchanged. The token never leaves the server, and the browser only
ever sees a same-origin URL.

These proxy routes hold no policy of their own. Authorization stays in
`api-salesops` — `withAuth` resolves *which* company the request is for, and the
upstream guard chain independently re-checks membership, exactly as D7 of the
predecessor established for every other admin call.

### D6 — Create is create-then-upload. Two calls, not a multipart create.

With `image` nullable, the chicken-and-egg dissolves: the admin action creates the
row, gets its id, then POSTs the file to `/:id/image` if one was chosen. No new
multipart create endpoint, no temporary placeholder ref, no change to how upload
works.

The failure mode is explicit and acceptable: if the create succeeds and the upload
fails, the row exists without an image. That is now a legal state, so it surfaces as
a normal "created, image failed to upload" message with the row already editable —
not a rollback, and not a lie. The inverse (uploading before the row exists) would
require orphan-sweeping on every abandoned form.

### D7 — Replace and remove reuse the post-commit deletion order, unchanged.

`public-catalog`'s D10 successor established it and it is not revisited: the DB row
is updated first, the old file is deleted only after that commit, and only when the
old ref is upload-minted. A failed cleanup logs `IMAGE_CLEANUP_FAILED` and does not
fail the request — the caller's intent is already satisfied and the residue is a
disk-space problem, not a correctness one. Deleting first would destroy a live image
if the update then failed.

Remove (`DELETE /:id/image`) is the same sequence with `null` as the new value.

### D8 — One placeholder component, used by the storefront and the admin.

`ProductCard` renders into a fixed box (`w-full h-64 object-cover`), so a missing
image already reserves its space — what breaks the page is the browser's broken-image
glyph, not the layout. The placeholder is an **inline SVG** in that same box: no
network request, no 404 round-trip, no flash. The same component backs the admin's
list thumbnails and form previews, so "no image" looks deliberate in all four places
rather than accidental in each.

## 3. Data model

| Table | Column | Before | After |
|---|---|---|---|
| `Product` (tenant + master) | `image` | `String` | `String?` |
| `Category` (tenant + master) | `image` | `String?` | unchanged |

One migration per schema, applied to both `prisma/tenant` and `prisma/master`.
Widening `NOT NULL` → `NULL` rewrites no rows and cannot fail on existing data. It
is **not** reversible without first deciding what to backfill, so the down path is
explicitly "restore from backup", not an automated rollback.

## 4. HTTP contract

### `api-salesops` (authenticated, tenant-scoped)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/products/:id/image` | Admin read. Serves inactive rows. `404` when the row has no image. |
| `POST` | `/products/:id/image` | Upload / replace. Existing endpoint, unchanged semantics. |
| `DELETE` | `/products/:id/image` | Remove. Sets `image = null`, deletes minted bytes after commit. |
| `GET` | `/categories/:id/image` | Admin read. `404` when the row has no image. |
| `POST` | `/categories/:id/image` | Upload / replace. |
| `DELETE` | `/categories/:id/image` | Remove. |

`POST /products` — `image` becomes optional in the body, and is rejected with `400`
when upload-minted (D4). `PATCH`/`PUT` likewise. Same for categories.
`ProductResponseDto.image` becomes `string | null`.

### `api-public`

`PublicProductDto.imageUrl` becomes `string | null`; `toPublicProductDto` returns
`null` when `product.image` is null rather than assembling a URL for nothing. The
image controller is untouched — a product with no image simply has no URL pointing at
it. **Category payload unchanged** (out of scope).

## 5. Admin UX

Both forms lose the raw-ref text input and gain an optional `<input type="file">`.

- **Create** — file optional. Row is created, then the file is uploaded (D6).
- **Edit** — current image shown as a thumbnail (via D5's endpoint, reached through
  D5b's proxy route), with *replace* and *remove*. Removing asks for confirmation,
  since it destroys bytes.
- **List** — thumbnail column for products and for categories, placeholder where
  there is none.

`AdminProductDto.image` becomes `string | null`, mirroring the upstream response.

The update payload never carries `image` at all. `UpdateProductDto.image` is optional
and the service only patches when the key is present, so omitting it means "do not
touch the image" — which makes it structurally impossible for a price edit to revert
a photo. That was the second reported symptom and it is fixed by omission, not by
validation.

## 6. Testing strategy

Strict TDD throughout: every implementation task is preceded by its failing test.

- **`packages/domain`** — `assertImageRef` and `isUploadMintedRef` per collection;
  pure, no filesystem.
- **`packages/infra-storage`** — `put` mints under the right collection; `open`/
  `delete` unchanged behaviour under the new names; the existing restart-proof spec
  keeps passing.
- **`apps/api-salesops`** — create without `image`; create/update rejecting a minted
  ref with 400; `GET` serving an inactive product's bytes; `DELETE` nulling the
  column and removing the file; cleanup failure logging without failing the request.
- **`apps/api-public`** — `imageUrl` null for an imageless product; list and detail
  still serve.
- **`apps/web-catalog`** — file input replaces the text field; create-then-upload
  ordering; edit thumbnail, replace, remove; placeholder rendered in card, detail,
  and both admin lists.

## 7. Risks

**The rename is a wide diff.** Four packages and all their specs. It is mechanical and
compiler-guided, but it should land as its own commit, before any behavioural change,
so a bisect can separate "renamed" from "broke".

**Per-package coverage gates are frozen at each package's baseline.** New files can dip
a package's number below its own ratchet and stop the build. Each package's coverage
is checked as that package closes, not once at the end.

**Two schemas must not drift.** The migration is authored twice, tenant and master.
A tenant-only migration passes every local test and fails in production.

## 8. Open points

None deliberately deferred by this change. The slug→company cache remains open from
the predecessor and is untouched here.
