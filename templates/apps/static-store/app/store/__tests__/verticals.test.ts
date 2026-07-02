import { describe, it, expect } from 'vitest';
import { VERTICALS } from '../verticals';

describe('VERTICALS registry', () => {
  it('registers the clothes vertical under its slug', () => {
    expect(VERTICALS.clothes).toBeDefined();
    expect(VERTICALS.clothes.slug).toBe('clothes');
    expect(VERTICALS.clothes.config.vertical).toBe('clothes');
  });
});
