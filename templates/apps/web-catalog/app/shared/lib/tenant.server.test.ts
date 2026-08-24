import { describe, it, expect } from 'vitest';
import { isPlatformAdminHost, resolveHostSlug, getRequestHostSlug, getRequestHost } from './tenant.server';

/**
 * Rewritten from `api-public`'s `host-slug.ts` (design.md D2/D9 — the two
 * apps must agree on the exact same grammar, but `web-catalog` never
 * imports another app's source, so this is new code reproducing the same
 * parse table, not a copy-paste).
 */
describe('resolveHostSlug', () => {
  it('resolves the first label of a two-label host, stripping the port', () => {
    expect(resolveHostSlug('default.localhost:3000', undefined)).toBe('default');
  });

  it('prefers X-Forwarded-Host over Host when both are present', () => {
    expect(resolveHostSlug('www.localhost:3000', 'acme.localhost:3000')).toBe('acme');
  });

  it('rejects a single-label host', () => {
    expect(resolveHostSlug('localhost:3000', undefined)).toBeNull();
  });

  it('rejects each reserved first label', () => {
    expect(resolveHostSlug('www.localhost:3000', undefined)).toBeNull();
    expect(resolveHostSlug('api.localhost:3000', undefined)).toBeNull();
    expect(resolveHostSlug('admin.localhost:3000', undefined)).toBeNull();
  });

  it('rejects a first label with disallowed characters', () => {
    expect(resolveHostSlug('ac_me.localhost:3000', undefined)).toBeNull();
  });

  it('rejects a first label starting with a hyphen', () => {
    expect(resolveHostSlug('-acme.localhost:3000', undefined)).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(resolveHostSlug('ACME.localhost:3000', undefined)).toBe('acme');
  });

  it('returns null when neither header is present', () => {
    expect(resolveHostSlug(undefined, undefined)).toBeNull();
  });
});

describe('getRequestHostSlug', () => {
  it('reads Host/X-Forwarded-Host off a real Request', () => {
    const request = new Request('http://ignored/', {
      headers: { host: 'default.localhost:3000' },
    });
    expect(getRequestHostSlug(request)).toBe('default');
  });

  it('returns null for an unresolvable Host', () => {
    const request = new Request('http://ignored/', { headers: { host: 'localhost:3000' } });
    expect(getRequestHostSlug(request)).toBeNull();
  });
});

describe('getRequestHost', () => {
  it('returns the raw Host header, unparsed — forwarded to api-public verbatim', () => {
    const request = new Request('http://ignored/', {
      headers: { host: 'default.localhost:3000' },
    });
    expect(getRequestHost(request)).toBe('default.localhost:3000');
  });
});

// Truth table (design D4): the platform console lives on the reserved first
// label `admin` — exactly the label `resolveHostSlug` rejects as a tenant.
describe('isPlatformAdminHost', () => {
  it('is true when labels[0] is admin', () => {
    const request = new Request('http://ignored/tiendas', {
      headers: { host: 'admin.localhost:3000' },
    });
    expect(isPlatformAdminHost(request)).toBe(true);
  });

  it('prefers X-Forwarded-Host, like every other host parse in this app', () => {
    const request = new Request('http://ignored/', {
      headers: { host: 'acme.localhost:3000', 'x-forwarded-host': 'admin.localhost:3000' },
    });
    expect(isPlatformAdminHost(request)).toBe(true);
  });

  it('is false for any other first label', () => {
    const request = new Request('http://ignored/', { headers: { host: 'acme.localhost:3000' } });
    expect(isPlatformAdminHost(request)).toBe(false);
  });

  it('is false when there are no labels (bare host / no header)', () => {
    expect(
      isPlatformAdminHost(new Request('http://ignored/', { headers: { host: 'localhost:3000' } })),
    ).toBe(false);
    expect(isPlatformAdminHost(new Request('http://ignored/'))).toBe(false);
  });
});
