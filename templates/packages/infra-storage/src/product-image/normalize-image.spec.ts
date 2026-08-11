import sharp from 'sharp';
import { normalizeImage, UnsupportedImageError } from './normalize-image.js';

/** Tiny flat-colour RGB raw buffer, deliberately non-square so a 90° rotation is detectable. */
function rawRgb(width: number, height: number, value = 0x80): Buffer {
  return Buffer.alloc(width * height * 3, value);
}

describe('normalizeImage', () => {
  it('honours EXIF rotation before resizing — a 90°-tagged landscape decodes as portrait', async () => {
    const width = 100;
    const height = 50;
    // EXIF orientation 6 = "rotate 90° CW to display correctly". sharp's
    // `.withMetadata({ orientation })` writes the tag WITHOUT applying the
    // rotation; `normalizeImage`'s own `.rotate()` (called with no args) is
    // what must consume it.
    const taggedButNotRotated = await sharp(rawRgb(width, height), {
      raw: { width, height, channels: 3 },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const result = await normalizeImage(taggedButNotRotated);
    const outputMeta = await sharp(result.bytes).metadata();

    // Width/height swapped: proves the 90° EXIF rotation was actually applied,
    // not just carried through as an untouched tag.
    expect(outputMeta.width).toBe(height);
    expect(outputMeta.height).toBe(width);
    // `.rotate()` bakes the rotation in and strips the EXIF orientation tag —
    // if this is still set, the output would visually re-rotate a second time
    // in any viewer that also honours EXIF.
    expect(outputMeta.orientation).toBeUndefined();
  });

  it('output is always webp, regardless of input format', async () => {
    const png = await sharp(rawRgb(20, 20), { raw: { width: 20, height: 20, channels: 3 } })
      .png()
      .toBuffer();

    const result = await normalizeImage(png);
    const outputMeta = await sharp(result.bytes).metadata();

    expect(result.contentType).toBe('image/webp');
    expect(outputMeta.format).toBe('webp');
  });

  it('downscales an oversize image to 1600px wide, preserving aspect ratio', async () => {
    const oversize = await sharp(rawRgb(2000, 1000), {
      raw: { width: 2000, height: 1000, channels: 3 },
    })
      .webp()
      .toBuffer();

    const result = await normalizeImage(oversize);
    const outputMeta = await sharp(result.bytes).metadata();

    expect(outputMeta.width).toBe(1600);
    expect(outputMeta.height).toBe(800);
  });

  it('never enlarges an image already under 1600px wide', async () => {
    const small = await sharp(rawRgb(100, 50), { raw: { width: 100, height: 50, channels: 3 } })
      .webp()
      .toBuffer();

    const result = await normalizeImage(small);
    const outputMeta = await sharp(result.bytes).metadata();

    expect(outputMeta.width).toBe(100);
    expect(outputMeta.height).toBe(50);
  });

  it('rejects non-image input with a controlled decode error, never an uncaught throw (D10)', async () => {
    const notAnImage = Buffer.from('this is definitely not an image file');

    await expect(normalizeImage(notAnImage)).rejects.toBeInstanceOf(UnsupportedImageError);
  });
});
