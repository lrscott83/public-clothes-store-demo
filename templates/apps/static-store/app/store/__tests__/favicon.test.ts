import { describe, it, expect } from 'vitest';
import { buildFaviconDataUri, faviconHref } from '../favicon';

const PREFIX = 'data:image/svg+xml,';
const decode = (href: string) => decodeURIComponent(href.slice(PREFIX.length));

describe('favicon data URI', () => {
  it('builds an inline SVG data URI stroked with the given color', () => {
    const href = buildFaviconDataUri('Store', 'rgb(1 2 3)');
    expect(href.startsWith(PREFIX)).toBe(true);

    const svg = decode(href);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('stroke="rgb(1 2 3)"');
    expect(svg).toContain('<path');
  });

  it('falls back to the Store icon for an unregistered icon name', () => {
    const store = buildFaviconDataUri('Store', 'rgb(0 0 0)');
    const unknown = buildFaviconDataUri('Nonexistent', 'rgb(0 0 0)');
    expect(unknown).toBe(store);
  });

  it('exposes faviconHref for the active vertical (appliances -> Store)', () => {
    expect(faviconHref.startsWith(PREFIX)).toBe(true);
    expect(decode(faviconHref)).toContain('<svg');
  });
});
