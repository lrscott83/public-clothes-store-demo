import { describe, it, expect } from 'vitest';
import { resolveStoreConfig } from './store-config.server';
import { defaultStoreConfig } from '../config/stores/default.config';

/**
 * design.md D9: "Unknown slug -> 404 from the loader, mirroring api-public;
 * two independent 404 paths, both tested." This is `web-catalog`'s half —
 * `api-public`'s `PublicTenantGuard` (design D4) is the other, already
 * tested in Phase 4.
 */
describe('resolveStoreConfig', () => {
  it('resolves the known "default" slug to its StoreConfig', () => {
    const request = new Request('http://ignored/', {
      headers: { host: 'default.localhost:3000' },
    });

    expect(resolveStoreConfig(request)).toBe(defaultStoreConfig);
  });

  it('throws a 404 Response for an unknown slug', async () => {
    const request = new Request('http://ignored/', {
      headers: { host: 'nope.localhost:3000' },
    });

    expect(() => resolveStoreConfig(request)).toThrow(Response);
    try {
      resolveStoreConfig(request);
      throw new Error('expected resolveStoreConfig to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(404);
    }
  });

  it('throws the identical 404 for a malformed Host as for a well-formed but unknown slug (D4 discipline)', () => {
    const malformed = new Request('http://ignored/', { headers: { host: 'localhost:3000' } });
    const unknown = new Request('http://ignored/', {
      headers: { host: 'nope.localhost:3000' },
    });

    let malformedStatus: number | undefined;
    let unknownStatus: number | undefined;
    try {
      resolveStoreConfig(malformed);
    } catch (err) {
      malformedStatus = (err as Response).status;
    }
    try {
      resolveStoreConfig(unknown);
    } catch (err) {
      unknownStatus = (err as Response).status;
    }

    expect(malformedStatus).toBe(404);
    expect(unknownStatus).toBe(404);
  });
});
