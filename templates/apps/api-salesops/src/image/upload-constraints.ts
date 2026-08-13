/** design.md §5 — 10MB upload ceiling. */
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * design.md §5's upload allowlist, matched against the type `FileTypeValidator`
 * DETECTS from the bytes — Nest 11 ships magic-number inspection (the
 * `file-type` package) on by default and we deliberately leave it on, so a
 * client-declared `Content-Type` cannot talk its way past this.
 *
 * This is a widening of D10, not a contradiction of it. D10 makes `sharp` the
 * authority on whether bytes are a usable image, and it still is. What the
 * signature check buys is narrower and worth more: attacker-controlled bytes
 * stop at a pure-JS check and never reach libvips, a large native decoder
 * whose format parsers are exactly the kind of code you do not want to hand
 * arbitrary input. Rejecting twice costs a few microseconds; rejecting once,
 * inside the native decoder, is the risk.
 *
 * `avif` is in the list because it has to be, not for completeness: `sharp`
 * decodes AVIF, and `file-type` reports it as `image/avif`. Omit it and a
 * format the pipeline handles perfectly well fails at the door — an allowlist
 * has to describe real capability, not an assumption about it. `heic`/`heif`
 * decode via libheif; encoding them is unsupported in this build and does not
 * matter, since every upload is re-encoded to webp.
 */
export const ALLOWED_IMAGE_MIME_TYPES = /^image\/(jpeg|png|webp|avif|heic|heif)$/;
