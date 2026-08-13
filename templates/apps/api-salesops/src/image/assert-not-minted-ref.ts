import { BadRequestException } from '@nestjs/common';
import { IMAGE_COLLECTIONS, isUploadMintedRef, type ImageCollection } from '@store-mgmt/domain';

/**
 * design.md D4 — only the upload endpoint may assign an upload-minted ref.
 * The invariant has no collection carve-out: a category-minted ref posted to
 * a product body must be rejected exactly as a product-minted one would be,
 * so this checks the ref against EVERY known collection (`IMAGE_COLLECTIONS`),
 * not just the one being written to.
 *
 * Removing the admin's free-text field closes this hole in the UI but not in
 * the API: any holder of a valid token could still POST another row's minted
 * ref (even one minted for a DIFFERENT collection) and alias the file, so a
 * later replace or remove would destroy an image that is still in use
 * elsewhere. `isUploadMintedRef` is the same predicate the destructive paths
 * are gated on, so the writer and the deleter agree by construction — the
 * deleter, unlike this write-guard, stays deliberately collection-scoped
 * (design.md D3): it only ever deletes what the CURRENT row's own collection
 * could have minted.
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
  if (IMAGE_COLLECTIONS.some((candidate) => isUploadMintedRef(image, candidate))) {
    throw new BadRequestException(
      `"image" cannot be set to an uploaded image ref. Use POST /${collection}/:id/image.`,
    );
  }
}
