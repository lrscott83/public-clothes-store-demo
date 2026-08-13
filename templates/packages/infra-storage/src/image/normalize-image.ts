import sharp from 'sharp';

/**
 * The only file in this package that imports `sharp` (design.md file map).
 * `FsImageStore` never touches image bytes for meaning — this is the
 * one place that does.
 */
const MAX_WIDTH_PX = 1600;
const WEBP_QUALITY = 82;

export interface NormalizedImage {
  readonly bytes: Uint8Array;
  readonly contentType: 'image/webp';
}

/**
 * `sharp` failing to decode a non-image is the REAL validation gate
 * (design.md D10) — `FileTypeValidator`'s `Content-Type` check (Phase 3) is
 * only a cheap first filter. Caught and rethrown as this controlled error so
 * a hostile upload maps to a `400`, never an uncaught rejection that could
 * take the process down.
 */
export class UnsupportedImageError extends Error {
  constructor(cause: unknown) {
    super(`Unable to decode image: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'UnsupportedImageError';
  }
}

/**
 * Normalizes an uploaded image to a single canonical shape: EXIF-rotated
 * upright, capped at 1600px wide (never enlarged), encoded as WebP. One
 * output format means one extension and one `Content-Type` downstream —
 * design.md D10 rejects the alternative ("keep the input format") because
 * heic/heif must convert anyway, so a passthrough branch would never cover
 * every input.
 */
export async function normalizeImage(bytes: Uint8Array): Promise<NormalizedImage> {
  try {
    const output = await sharp(bytes)
      .rotate() // no-arg form: auto-orient from EXIF, then strip the tag
      .resize({ width: MAX_WIDTH_PX, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    return { bytes: output, contentType: 'image/webp' };
  } catch (cause) {
    throw new UnsupportedImageError(cause);
  }
}
