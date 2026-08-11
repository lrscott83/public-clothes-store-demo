// Phase 0, spike 0.3: proves `sharp` installs and runs in THIS pnpm/turbo
// workspace (a nested template inside a legacy repo — the exact place
// native-binary installs tend to break). One-line decode/encode round trip:
// build a tiny raw RGB buffer in memory, decode it as a `sharp` image, run
// the SAME operation chain Phase 2's `normalize-image.ts` will use
// (rotate -> resize -> webp), and assert the output is a non-empty WebP
// buffer. No filesystem, no fixture image needed.
import sharp from 'sharp';

const width = 4;
const height = 4;
const raw = Buffer.alloc(width * height * 3, 0x80); // flat mid-gray RGB

const output = await sharp(raw, { raw: { width, height, channels: 3 } })
  .rotate()
  .resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 82 })
  .toBuffer();

const isWebp = output.slice(8, 12).toString('ascii') === 'WEBP';

if (output.byteLength === 0 || !isWebp) {
  console.error(
    `FAIL: sharp smoke test produced an unexpected output (bytes=${output.byteLength}, webp=${isWebp})`,
  );
  process.exit(1);
}

console.log(
  `PASS: sharp decode -> rotate -> resize -> webp round trip produced ${output.byteLength} bytes of valid WebP.`,
);
