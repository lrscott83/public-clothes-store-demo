import { createHash } from 'node:crypto';

/**
 * design.md D6: `imageKey` is `sha1(product.image).slice(0,16)` plus the
 * ref's own extension — a CACHE key, not a security boundary. Stable while
 * the image is; changes the instant a re-upload mints a new ref.
 */
export function computeImageKey(ref: string): string {
  const hash = createHash('sha1').update(ref).digest('hex').slice(0, 16);
  const extension = ref.slice(ref.lastIndexOf('.') + 1);
  return `${hash}.${extension}`;
}

/**
 * Assembles the public, cache-keyed image URL for a product — the ONE
 * place this is built (D6/§3); `web-catalog` never constructs this path
 * itself and never sees the storage ref. `PUBLIC_ASSET_BASE_URL` prefixes
 * it when a CDN lands; unset today, so it resolves to a bare relative path.
 */
export function assemblePublicImageUrl(productId: string, ref: string): string {
  const base = process.env.PUBLIC_ASSET_BASE_URL ?? '';
  return `${base}/public/products/${productId}/image/${computeImageKey(ref)}`;
}

/** `true` when a requested `imageKey` (from the URL) matches the CURRENT ref's key — a stale URL (post re-upload) must 404, never serve the old bytes under the new path (D6). */
export function imageKeyMatchesRef(imageKey: string, ref: string): boolean {
  return imageKey === computeImageKey(ref);
}
