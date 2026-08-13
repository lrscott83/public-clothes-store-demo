import { BadRequestException } from '@nestjs/common';
import { isUploadMintedRef, type ImageCollection } from '@store-mgmt/domain';

/**
 * design.md D4 — only the upload endpoint may assign an upload-minted ref.
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
