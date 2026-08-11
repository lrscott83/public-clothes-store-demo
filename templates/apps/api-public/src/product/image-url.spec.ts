import { assemblePublicImageUrl, computeImageKey, imageKeyMatchesRef } from './image-url.js';

/**
 * `computeImageKey`/`assemblePublicImageUrl` were implemented in 4.7-4.8
 * (the DTO's `imageUrl` field needed them to exist already). This is an
 * approval-test pass, locking in the D6 contract explicitly before
 * `product-image.controller.ts` (4.9-4.10) is built to depend on
 * `imageKeyMatchesRef` for real — not a RED-first cycle for these two
 * functions, since their behavior was already fixed by design D6 when they
 * were written. `imageKeyMatchesRef` itself is new in this file's scope.
 */
describe('image-url', () => {
  const originalBaseUrl = process.env.PUBLIC_ASSET_BASE_URL;

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.PUBLIC_ASSET_BASE_URL;
    } else {
      process.env.PUBLIC_ASSET_BASE_URL = originalBaseUrl;
    }
  });

  describe('computeImageKey', () => {
    it('is deterministic: the same ref always produces the same key', () => {
      const ref = 'products/33333333-3333-3333-3333-333333333333.webp';
      expect(computeImageKey(ref)).toBe(computeImageKey(ref));
    });

    it('is a 16-hex-char sha1 prefix plus the ref extension (design D6)', () => {
      const key = computeImageKey('products/abc.webp');
      expect(key).toMatch(/^[0-9a-f]{16}\.webp$/);
    });

    it('changes the instant the ref changes — a re-upload mints a new key', () => {
      const before = computeImageKey('products/aaaa.webp');
      const after = computeImageKey('products/bbbb.webp');
      expect(before).not.toBe(after);
    });

    it('preserves the extension of the ref it was computed from (jpeg vs webp)', () => {
      expect(computeImageKey('products/x.jpeg')).toMatch(/\.jpeg$/);
      expect(computeImageKey('products/x.webp')).toMatch(/\.webp$/);
      expect(computeImageKey('products/x.png')).toMatch(/\.png$/);
    });
  });

  describe('assemblePublicImageUrl', () => {
    it('assembles /public/products/:id/image/:imageKey with no base URL by default', () => {
      const ref = 'products/abc.webp';
      const url = assemblePublicImageUrl('product-uuid-1', ref);
      expect(url).toBe(`/public/products/product-uuid-1/image/${computeImageKey(ref)}`);
    });

    it('prefixes PUBLIC_ASSET_BASE_URL when set (CDN-ready per design D6)', () => {
      process.env.PUBLIC_ASSET_BASE_URL = 'https://cdn.example.com';
      const ref = 'products/abc.webp';
      const url = assemblePublicImageUrl('product-uuid-1', ref);
      expect(url).toBe(`https://cdn.example.com/public/products/product-uuid-1/image/${computeImageKey(ref)}`);
    });
  });

  describe('imageKeyMatchesRef', () => {
    it('matches when the key was computed from the SAME ref', () => {
      const ref = 'products/current.webp';
      expect(imageKeyMatchesRef(computeImageKey(ref), ref)).toBe(true);
    });

    it('does NOT match a stale key from a PREVIOUS ref — a re-uploaded image invalidates the old URL', () => {
      const staleRef = 'products/old.webp';
      const currentRef = 'products/new.webp';
      expect(imageKeyMatchesRef(computeImageKey(staleRef), currentRef)).toBe(false);
    });
  });
});
