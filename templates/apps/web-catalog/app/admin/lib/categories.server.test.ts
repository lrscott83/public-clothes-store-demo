import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listCategories } from './categories.server';
import { createSession } from '../../shared/lib/session.server';
import type { AdminCategoryDto } from './admin-api.types';

const CATEGORY: AdminCategoryDto = {
  id: 'cat-1',
  name: 'Remeras',
  slug: 'remeras',
  image: null,
  icon: null,
  order: 1,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function sessionRequest() {
  const created = await createSession('access-1', 'refresh-1', 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request('http://ignored/admin/productos', { headers: { Cookie: cookie } });
}

describe('categories.server', () => {
  const originalSecret = process.env.SESSION_SECRET;
  const originalApiUrl = process.env.API_SALESOPS_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.API_SALESOPS_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret;
    process.env.API_SALESOPS_URL = originalApiUrl;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('listCategories fetches /categories with the resolved companyId', async () => {
    const request = await sessionRequest();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([CATEGORY]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await listCategories(request, 'company-1');

    expect(result).toEqual([CATEGORY]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/categories');
    expect((init.headers as Headers).get('X-Company-Id')).toBe('company-1');
  });
});
