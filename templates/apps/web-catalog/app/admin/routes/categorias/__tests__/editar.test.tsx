import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { action, EditarCategoriaPage, type EditarCategoriaPageProps } from '../editar';
import { createSession } from '../../../../shared/lib/session.server';
import { deleteCategoryImage, updateCategory } from '../../../lib/categories.server';
import type { AdminCategoryDto } from '../../../lib/admin-api.types';

/**
 * `deleteCategoryImage`/`updateCategory` are wrapped, not stubbed out — each
 * wrapper's default implementation IS the real function (`vi.fn(actual.fn)`),
 * so the pre-existing describe blocks above (cross-company rejection) keep
 * exercising real `makeAuthenticatedRequest`/`fetch` behavior unchanged.
 * This file's own `describe('action', ...)` block only reads `.mock.calls`
 * off these same references to assert the new `remove-image` branch's
 * wiring and the no-`image`-leak guarantee — it doesn't need a behavior
 * override, just a spy (mirrors `productos/editar.test.tsx`'s task 6.4
 * setup).
 */
vi.mock('../../../lib/categories.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/categories.server')>();
  return {
    ...actual,
    deleteCategoryImage: vi.fn(actual.deleteCategoryImage),
    updateCategory: vi.fn(actual.updateCategory),
  };
});

function companyLookupResponse() {
  return new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
    status: 200,
  });
}

function freshJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  return `${header}.${payload}.`;
}

async function adminRequest(refreshToken: string, url = 'http://ignored/admin/categorias/cat-1/editar') {
  const created = await createSession(freshJwt(), refreshToken, 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie, host: 'default.localhost:3010' } });
}

function deleteFormRequest(request: Request) {
  const body = new URLSearchParams({ intent: 'delete' });
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

function updateFormRequest(request: Request) {
  const body = new URLSearchParams({
    name: 'Remeras (editada)',
    slug: 'remeras',
    order: '1',
  });
  return new Request(request.url, {
    method: 'POST',
    headers: { ...Object.fromEntries(request.headers), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

/**
 * Mirrors `productos/editar.test.tsx`'s cross-company suite (task 6.5's
 * done-criterion, reused verbatim for categories per task 6.6): `companyId`
 * always comes from `withAuth`'s own resolution of THIS subdomain — never
 * from user input — so the only way a mutation could ever cross a company
 * boundary is if `api-salesops`'s `TenantContextGuard` rejects it. These
 * tests prove `editar.tsx`'s action treats that 403 as a genuine failure —
 * never a redirect, never a partial success — for BOTH update and
 * soft-delete.
 */
describe('editar action — cross-company mutation rejection', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_IDP_URL = 'http://localhost:3002';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_IDP_URL = originalIdpUrl;
    process.env.API_SALESOPS_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('an update attempt on a category outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-update-403');
    const request = updateFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      // api-salesops's TenantContextGuard: caller has no ACTIVE membership
      // in the resolved companyId -> 403, never a cross-company fallback.
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'cat-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    // Never a Response (redirect) — a plain error object is the ONLY way
    // this action signals "not applied."
    expect(result).not.toBeInstanceOf(Response);
    const [, updateInit] = fetchMock.mock.calls[1];
    expect(updateInit.method).toBe('PATCH');
  });

  it('a soft-delete attempt on a category outside the caller\'s company is rejected, not redirected', async () => {
    const base = await adminRequest('refresh-delete-403');
    const request = deleteFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(null, { status: 403 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await action({ request, params: { id: 'cat-1' }, context: {} } as never);

    expect(result).toEqual({ error: expect.stringContaining('permiso') });
    expect(result).not.toBeInstanceOf(Response);
    const [, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteInit.method).toBe('DELETE');
  });

  it('a same-company update still succeeds and redirects — the 403 tests above are not a blanket failure', async () => {
    const base = await adminRequest('refresh-update-200');
    const request = updateFormRequest(base);
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    }) as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'cat-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/categorias');
  });

  it('a same-company soft-delete still succeeds, redirects, and the DELETE call is the ONLY mutation issued — the row is soft-deleted (active=false) server-side, never hard-deleted', async () => {
    const base = await adminRequest('refresh-delete-200');
    const request = deleteFormRequest(base);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const response = (await action({ request, params: { id: 'cat-1' }, context: {} } as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/admin/categorias');
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1];
    expect(deleteUrl).toBe('http://localhost:3001/categories/cat-1');
    expect(deleteInit.method).toBe('DELETE');
  });
});

const category: AdminCategoryDto = {
  id: 'cat-1',
  name: 'Remeras',
  slug: 'remeras',
  image: 'categories/remeras.jpg',
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderEditar(props: EditarCategoriaPageProps) {
  const Stub = createRoutesStub([{ path: '/', Component: () => <EditarCategoriaPage {...props} /> }]);
  return render(<Stub />);
}

describe('image panel', () => {
  it('shows the current image through the proxy route, not the raw ref', () => {
    renderEditar({ category: { ...category, image: 'categories/x.webp' } });

    expect(screen.getByRole('img', { name: category.name })).toHaveAttribute(
      'src',
      `/admin/categorias/${category.id}/image`,
    );
    expect(screen.queryByText('categories/x.webp')).not.toBeInTheDocument();
  });

  it('shows the placeholder and no remove button when there is no image', () => {
    renderEditar({ category: { ...category, image: null } });

    expect(screen.getByLabelText(`${category.name} (sin imagen)`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar imagen' })).not.toBeInTheDocument();
  });

  it('offers removal when there is an image', () => {
    renderEditar({ category: { ...category, image: 'categories/x.webp' } });

    expect(screen.getByRole('button', { name: 'Quitar imagen' })).toBeInTheDocument();
  });

  it('labels the upload button "Subir imagen" when there is no image yet', () => {
    renderEditar({ category: { ...category, image: null } });

    expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reemplazar imagen' })).not.toBeInTheDocument();
  });

  it('labels the same button "Reemplazar imagen" once an image already exists', () => {
    renderEditar({ category: { ...category, image: 'categories/x.webp' } });

    expect(screen.getByRole('button', { name: 'Reemplazar imagen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir imagen' })).not.toBeInTheDocument();
  });
});

/**
 * This file's own action coverage: the `upload-image` and `remove-image`
 * branches' wiring, and the security property the brief calls out
 * explicitly — a regular field-edit submission must never be able to
 * smuggle an `image` value into `updateCategory`'s payload (that's the only
 * way a normal edit could revert or hijack the photo, since
 * `upload-image`/`remove-image` are the only branches allowed to touch it).
 */
describe('action', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalIdpUrl = process.env.API_IDP_URL;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalFetch = global.fetch;
  let cookie = '';

  beforeEach(async () => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_IDP_URL = 'http://localhost:3002';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';

    const created = await createSession(freshJwt(), 'refresh-image-panel', 'user-1');
    cookie = created.headers.get('Set-Cookie') ?? '';

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify({ id: 'cat-1' }), { status: 200 }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_IDP_URL = originalIdpUrl;
    process.env.API_SALESOPS_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function requestWith(formData: FormData) {
    const req = new Request('http://ignored/admin/categorias/cat-1/editar', {
      method: 'POST',
      headers: { Cookie: cookie, host: 'default.localhost:3010' },
    });
    Object.defineProperty(req, 'formData', { value: async () => formData });
    return req;
  }

  it('uploads the image on intent=upload-image and redirects back to the edit route', async () => {
    const file = new File(['bytes'], 'photo.png', { type: 'image/png' });
    const formData = new FormData();
    formData.set('intent', 'upload-image');
    formData.set('image', file);

    const result = (await action({
      request: requestWith(formData),
      params: { id: 'cat-1' },
    } as never)) as Response;

    const [, uploadInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(uploadInit.method).toBe('POST');
    expect((uploadInit.body as FormData).get('image')).toBeInstanceOf(File);
    expect(result.headers.get('Location')).toBe('/admin/categorias/cat-1/editar');
  });

  it('removes the image on intent=remove-image and returns to this page', async () => {
    const formData = new FormData();
    formData.set('intent', 'remove-image');

    const result = (await action({
      request: requestWith(formData),
      params: { id: 'cat-1' },
    } as never)) as Response;

    expect(deleteCategoryImage).toHaveBeenCalledWith(expect.anything(), 'company-1', 'cat-1');
    expect(result.headers.get('Location')).toBe('/admin/categorias/cat-1/editar');
  });

  it('does not send image in the update payload — a field edit cannot revert the photo', async () => {
    const formData = new FormData();
    formData.set('name', 'Remeras (editada)');
    formData.set('slug', 'remeras');
    formData.set('order', '1');
    formData.set('image', 'categories/attacker-chosen.webp');

    await action({ request: requestWith(formData), params: { id: 'cat-1' } } as never);

    expect(updateCategory).toHaveBeenCalledWith(
      expect.anything(),
      'company-1',
      'cat-1',
      expect.not.objectContaining({ image: expect.anything() }),
    );
  });
});
