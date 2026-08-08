import { describe, expect, it } from 'vitest';
import { faviconHref, buildFaviconDataUri } from '../favicon';

describe('faviconHref', () => {
  it('is an inline SVG data URI', () => {
    expect(faviconHref.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('matches the appliances storefront favicon: the Store glyph in rgb(37 99 235)', () => {
    const svg = decodeURIComponent(faviconHref.replace('data:image/svg+xml,', ''));
    // Appliances brand primary.
    expect(svg).toContain('stroke="rgb(37 99 235)"');
    // A signature segment of the Lucide "Store" glyph.
    expect(svg).toContain('M4 12v8a2 2 0 0 0 2 2h12');
  });

  it('falls back to no color leak — buildFaviconDataUri strokes with the given color', () => {
    const uri = buildFaviconDataUri('<path d="M0 0"/>', 'red');
    expect(decodeURIComponent(uri)).toContain('stroke="red"');
  });
});
