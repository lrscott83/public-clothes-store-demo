import { describe, it, expect } from 'vitest';
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
