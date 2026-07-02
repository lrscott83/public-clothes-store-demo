import { describe, it, expect } from 'vitest';
import { resolveVertical, DEFAULT_VERTICAL } from '../config/resolve-vertical';
import type { StoreVertical } from '../config/types';

function makeVertical(slug: string): StoreVertical {
  return {
    slug,
    config: {
      vertical: slug,
      brand: { name: slug, copyright: `(c) ${slug}` },
      locale: 'en-US',
      currency: 'USD',
      theme: {},
      logo: { alt: slug },
      hero: { image: '/hero.jpg', heading: 'h', subheading: 's' },
      nav: [{ label: 'Home', path: '/', kind: 'route' }],
      footer: { copyright: `(c) ${slug}` },
      catalog: { categories: [], products: [] },
    },
  };
}

describe('resolveVertical', () => {
  const registry: Record<string, StoreVertical> = {
    clothes: makeVertical('clothes'),
    demo: makeVertical('demo'),
  };

  it('resolves the vertical matching a valid env value', () => {
    const result = resolveVertical(registry, 'demo', 'clothes');

    expect(result.slug).toBe('demo');
  });

  it('falls back to the default vertical when the env value is undefined', () => {
    const result = resolveVertical(registry, undefined, 'clothes');

    expect(result.slug).toBe('clothes');
  });

  it('falls back to the default vertical when the env value is an empty string', () => {
    const result = resolveVertical(registry, '', 'clothes');

    expect(result.slug).toBe('clothes');
  });

  it('uses DEFAULT_VERTICAL ("clothes") when no explicit defaultVertical is passed', () => {
    const result = resolveVertical(registry, undefined);

    expect(result.slug).toBe(DEFAULT_VERTICAL);
    expect(DEFAULT_VERTICAL).toBe('clothes');
  });

  it('throws a descriptive error naming the missing vertical for an unknown env value', () => {
    expect(() => resolveVertical(registry, 'doesnotexist', 'clothes')).toThrow(/doesnotexist/);
  });
});
