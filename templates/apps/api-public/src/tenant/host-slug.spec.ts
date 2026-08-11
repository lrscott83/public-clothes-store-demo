import { resolveHostSlug } from './host-slug.js';

/**
 * D2's parse table, as a pure function with no Nest/Express dependency
 * (D2/D3): `resolveHostSlug` never throws and never hits the database —
 * every rejection returns `null` so the guard (4.3/4.4) can turn every one
 * of them into the SAME 404, never a distinguishable 400 (D4).
 */
describe('resolveHostSlug', () => {
  it('resolves the first label of a well-formed two-label Host header', () => {
    expect(resolveHostSlug('acme.localhost', undefined)).toBe('acme');
  });

  it('strips a trailing :port before splitting into labels', () => {
    expect(resolveHostSlug('acme.localhost:3000', undefined)).toBe('acme');
  });

  it('prefers X-Forwarded-Host over Host when both are present', () => {
    expect(resolveHostSlug('ignored-host.localhost', 'acme.example.com')).toBe('acme');
  });

  it('falls back to Host when X-Forwarded-Host is absent', () => {
    expect(resolveHostSlug('acme.localhost', undefined)).toBe('acme');
  });

  it('rejects a single-label host (nothing to resolve a tenant from)', () => {
    expect(resolveHostSlug('localhost:3000', undefined)).toBeNull();
  });

  it('rejects a reserved first label: www', () => {
    expect(resolveHostSlug('www.example.com', undefined)).toBeNull();
  });

  it('rejects a reserved first label: api', () => {
    expect(resolveHostSlug('api.example.com', undefined)).toBeNull();
  });

  it('rejects a reserved first label: admin', () => {
    expect(resolveHostSlug('admin.example.com', undefined)).toBeNull();
  });

  it('rejects a first label with disallowed characters (underscore)', () => {
    expect(resolveHostSlug('acme_store.localhost', undefined)).toBeNull();
  });

  it('rejects a first label starting with a hyphen', () => {
    expect(resolveHostSlug('-acme.localhost', undefined)).toBeNull();
  });

  it('lowercases a mixed-case host before resolving the slug', () => {
    expect(resolveHostSlug('ACME.localhost', undefined)).toBe('acme');
  });

  it('returns null when both Host and X-Forwarded-Host are absent', () => {
    expect(resolveHostSlug(undefined, undefined)).toBeNull();
  });
});
