import { describe, it, expect, afterEach, vi } from 'vitest';
import { withBase, verticalAsset } from '../config/asset';

describe('withBase', () => {
  it('prefixes an absolute path with a base subpath', () => {
    expect(withBase('/logo.png', '/repo/')).toBe('/repo/logo.png');
  });

  it('prefixes a relative path (no leading slash) with a base subpath', () => {
    expect(withBase('logo.png', '/repo/')).toBe('/repo/logo.png');
  });

  it('normalizes a base subpath missing a trailing slash', () => {
    expect(withBase('logo.png', '/repo')).toBe('/repo/logo.png');
  });

  it('defaults to root base "/" when no base is given', () => {
    expect(withBase('logo.png')).toBe('/logo.png');
  });
});

describe('verticalAsset', () => {
  it('builds a base-prefixed path under verticals/{slug}/', () => {
    expect(verticalAsset('clothes', 'hero.jpg', '/repo/')).toBe('/repo/verticals/clothes/hero.jpg');
  });

  it('builds a distinct path for a different vertical slug', () => {
    expect(verticalAsset('demo', 'logo.png', '/repo/')).toBe('/repo/verticals/demo/logo.png');
  });
});

// GH Pages deploy (Phase 10): when no explicit `base` argument is given,
// both helpers must fall back to `import.meta.env.BASE_URL` — the value
// Vite injects from its `base` config option (threaded from `VITE_BASE` at
// build time, see `vite.config.ts`). This is what lets vertical
// `store.config.ts` files call `verticalAsset(slug, key)` with no base
// argument and still get correctly-prefixed URLs under a GH Pages subpath.
describe('default base falls back to import.meta.env.BASE_URL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('withBase uses import.meta.env.BASE_URL when no base argument is given', () => {
    vi.stubEnv('BASE_URL', '/repo/');
    expect(withBase('logo.png')).toBe('/repo/logo.png');
  });

  it('verticalAsset uses import.meta.env.BASE_URL when no base argument is given', () => {
    vi.stubEnv('BASE_URL', '/repo/');
    expect(verticalAsset('clothes', 'hero.jpg')).toBe('/repo/verticals/clothes/hero.jpg');
  });

  it('still defaults to root "/" when BASE_URL is unset (dev/local default)', () => {
    expect(withBase('logo.png')).toBe('/logo.png');
  });
});
