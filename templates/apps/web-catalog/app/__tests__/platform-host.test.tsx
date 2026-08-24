import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App, { loader as rootLoader } from '../root';
import routes from '../routes';
import { loader as platformLayoutLoader } from '../shared/routes/_platform';
import { createSession } from '../shared/lib/session.server';
import { defaultStoreConfig } from '../shared/config/stores/default.config';

/**
 * D4 host × path matrix (spec: salesops-platform "Admin Host Serves Only
 * Platform Routes"). Loaders are invoked DIRECTLY — the repo's route tests
 * avoid full data routers (jsdom+undici cannot construct a client-side
 * Request/AbortSignal), and a plain `new Request(...)` is exactly what a
 * real server request hands these loaders.
 */
function requestFor(host: string | undefined, path: string): Request {
  return new Request(`http://ignored${path}`, {
    headers: host ? { host } : {},
  });
}

async function loaderResult(request: Request): Promise<{ resolved?: unknown; redirect?: Response }> {
  try {
    return { resolved: await rootLoader({ request, params: {}, context: undefined } as never) };
  } catch (err) {
    if (err instanceof Response) {
      return { redirect: err };
    }
    throw err;
  }
}

describe('root loader — admin host branching (design D4)', () => {
  it('admin × / → redirects to /tiendas', async () => {
    const { redirect } = await loaderResult(requestFor('admin.localhost:3000', '/'));
    expect(redirect).toBeDefined();
    expect(redirect!.status).toBe(302);
    expect(redirect!.headers.get('location')).toBe('/tiendas');
  });

  it('admin × /productos → redirects to /tiendas — no tenant content ever renders', async () => {
    const { redirect } = await loaderResult(requestFor('admin.localhost:3000', '/productos'));
    expect(redirect).toBeDefined();
    expect(redirect!.status).toBe(302);
    expect(redirect!.headers.get('location')).toBe('/tiendas');
  });

  it('admin × /tiendas/nueva → platform marker (skip StoreConfig)', async () => {
    const { resolved } = await loaderResult(requestFor('admin.localhost:3000', '/tiendas/nueva'));
    expect(resolved).toEqual({ platform: true });
  });

  // The console's OWN login lives at /admin/login (design D6 sends every
  // guard redirect there). Redirecting it to /tiendas would loop forever
  // (found at runtime): /tiendas → anonymous → /admin/login → root loader →
  // /tiendas … So the /admin prefix is part of the platform surface.
  it('admin × /admin/login → platform marker, NOT a redirect (loop prevention)', async () => {
    const { resolved, redirect } = await loaderResult(
      requestFor('admin.localhost:3000', '/admin/login'),
    );
    expect(redirect).toBeUndefined();
    expect(resolved).toEqual({ platform: true });
  });

  it('tenant × / → unchanged tenant resolution (StoreConfig)', async () => {
    const { resolved, redirect } = await loaderResult(requestFor('default.localhost:3000', '/'));
    expect(redirect).toBeUndefined();
    expect(resolved).toEqual({ config: defaultStoreConfig });
  });

  it('tenant × /tiendas → normal tenant resolution proceeds; the generic 404 comes from the _platform layout, identical to any unknown path', async () => {
    const { resolved } = await loaderResult(requestFor('default.localhost:3000', '/tiendas'));
    expect(resolved).toEqual({ config: defaultStoreConfig });

    // The route itself matches on every host (routes are host-agnostic);
    // the layout's defense-in-depth is what turns it into THE generic 404.
    let caught: unknown;
    try {
      await platformLayoutLoader({
        request: requestFor('default.localhost:3000', '/tiendas'),
        params: {},
        context: undefined,
      } as never);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(404);

    // Identical to an unknown storefront path's 404 (store-config.server.ts):
    // same status AND same body text.
    expect(await (caught as Response).text()).toBe('Not Found');
  });
});

describe('_platform layout loader — admin host passes through', () => {
  it('does NOT throw on an admin host', async () => {
    // The layout's session guard calls the platform list endpoint — stand in
    // for api-idp, provide the secret the session storage requires, and a
    // valid session cookie (the guard itself is covered by tiendas.test.tsx).
    const originalSecret = process.env.SESSION_SECRET;
    const originalFetch = global.fetch;
    process.env.SESSION_SECRET = 'test-secret';
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })) as unknown as typeof fetch;

    try {
      const sessionResponse = await createSession('access-1', 'refresh-1', 'user-1', '/irrelevant');
      const cookie = (sessionResponse.headers.get('Set-Cookie') ?? '').split(';')[0];
      await expect(
        platformLayoutLoader({
          request: new Request('http://ignored/tiendas', {
            headers: { host: 'admin.localhost:3000', Cookie: cookie },
          }),
          params: {},
          context: undefined,
        } as never),
      ).resolves.toEqual({ companies: [] });
    } finally {
      process.env.SESSION_SECRET = originalSecret;
      global.fetch = originalFetch;
    }
  });
});

describe('App — minimal platform shell when the root loader marked the request as platform', () => {
  it('renders the platform shell and NO tenant Header/Footer (they require a StoreConfig)', () => {
    render(
      <MemoryRouter initialEntries={['/tiendas']}>
        <App
          loaderData={{ platform: true } as never}
          params={{} as never}
          matches={[] as never}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('platform-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('storefront-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('storefront-footer')).not.toBeInTheDocument();
  });
});

describe('routes.ts registers the _platform sibling branch outside _auth.tsx', () => {
  it('registers _platform.tsx layout with the tiendas routes', () => {
    const platformBranch = routes.find(
      (r) => typeof r.file === 'string' && r.file.includes('_platform'),
    );
    expect(platformBranch).toBeDefined();
    const children = (platformBranch as { children?: Array<{ path?: string }> }).children ?? [];
    const paths = children.map((c) => c.path);
    expect(paths).toContain('tiendas');
    expect(paths).toContain('tiendas/nueva');
  });
});
