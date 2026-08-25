import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { action, importErrorMessage, ImportarProductosPage } from '../importar';
import routes from '../../../../routes';
import { createSession } from '../../../../shared/lib/session.server';
import type { AdminImportReport } from '../../../lib/admin-api.types';

// A fresh Response per call — a shared instance's body stream can only be
// read once, and reusing one across mock calls throws "Body has already
// been read" the second time `resolveCompanyId` calls `.json()` on it.
function companyLookupResponse() {
  return new Response(JSON.stringify({ id: 'company-1', slug: 'default', name: 'Urbana Ropa' }), {
    status: 200,
  });
}

async function adminRequest(url = 'http://ignored/admin/productos/importar') {
  const created = await createSession(freshJwt(), 'refresh-importar', 'user-1');
  const cookie = created.headers.get('Set-Cookie') ?? '';
  return new Request(url, { headers: { Cookie: cookie, host: 'default.localhost:3010' } });
}

function freshJwt(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64');
  return `${header}.${payload}.`;
}

/**
 * A real multipart-encoded `Request` round-tripped through `.formData()`
 * hits cross-realm `File`/`FormData` mismatches between jsdom's fetch
 * globals and Node's (undici) — `formData()` is overridden directly on the
 * (still real, real headers/url) `Request` instance so the action under
 * test sees the exact `FormData` a browser's multipart body would parse
 * into (same workaround `nuevo.test.tsx` uses for its upload-image test).
 */
function multipartCsvRequest(request: Request, file?: File) {
  const formData = new FormData();
  if (file) {
    formData.set('csvFile', file);
  }
  const req = new Request(request.url, {
    method: 'POST',
    headers: Object.fromEntries(request.headers),
  });
  Object.defineProperty(req, 'formData', { value: async () => formData });
  return req;
}

const REPORT: AdminImportReport = {
  totalRows: 3,
  created: 1,
  updated: 1,
  failed: 1,
  rows: [
    { line: 1, status: 'created', name: 'Remera Oversize' },
    { line: 2, status: 'updated', name: 'Pantalon Cargo' },
    { line: 3, status: 'failed', name: null, reason: 'Moneda GBP inválida. Valores permitidos: USD, EUR, MN.' },
  ],
};

describe('routes.ts registration (S19)', () => {
  it('registers admin/productos/importar INSIDE the _auth layout block so anonymous visitors hit its login redirect', () => {
    const authBranch = routes.find((r) => typeof r.file === 'string' && r.file.includes('_auth'));
    expect(authBranch).toBeDefined();
    const children = (authBranch as { children?: Array<{ path?: string }> }).children ?? [];
    expect(children.map((c) => c.path)).toContain('admin/productos/importar');
  });
});

describe('importar action', () => {
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

  function csvFile(): File {
    return new File(['categoria;nombre\r\n'], 'productos.csv', { type: 'text/csv' });
  }

  it('forwards the file as FormData field "csv" and returns the report on success (S17)', async () => {
    const request = multipartCsvRequest(await adminRequest(), csvFile());
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      return Promise.resolve(new Response(JSON.stringify(REPORT), { status: 200 }));
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result).toEqual({ report: REPORT });
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(url).toBe('http://localhost:3001/products/import');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('csv')).toBeInstanceOf(File);
  });

  it('asks for a file when none was attached instead of calling the API', async () => {
    const request = multipartCsvRequest(await adminRequest());
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await action({ request, params: {}, context: {} } as never);

    expect(result).toEqual({ error: 'Adjuntá un archivo CSV.' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // company lookup only
  });

  it.each([400, 403, 413])(
    'maps a raw %i Response to a Spanish voseo rejection message — no partial report (S18)',
    async (status) => {
      const request = multipartCsvRequest(await adminRequest(), csvFile());
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/companies/')) return Promise.resolve(companyLookupResponse());
        return Promise.resolve(new Response(null, { status }));
      }) as unknown as typeof fetch;

      const result = (await action({ request, params: {}, context: {} } as never)) as { error?: string };

      expect(result.error).toBe(importErrorMessage(status));
      expect(result.error).not.toEqual(expect.stringContaining('undefined'));
      // Every mapped message is actionable Spanish addressed to the user (voseo).
      expect(['revisá', 'tenés', 'subí', 'adjuntá', 'corregí'].some((vos) =>
        result.error!.toLowerCase().includes(vos),
      )).toBe(true);
    },
  );
});

describe('ImportarProductosPage (S17)', () => {
  function renderPage(props: Parameters<typeof ImportarProductosPage>[0] = {}) {
    // `<Form>` needs a router context — same stub pattern `nuevo.test.tsx` uses.
    const Stub = createRoutesStub([
      { path: '/', Component: () => <ImportarProductosPage {...props} /> },
    ]);
    return render(<Stub />);
  }

  it('renders the upload form when there is nothing to report yet', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Importar productos' })).toBeInTheDocument();
    expect(screen.getByText('Subí tu archivo CSV')).toBeInTheDocument();
    expect(screen.getByLabelText(/archivo/i)).toHaveAttribute('type', 'file');
  });

  it('renders totals plus every per-row outcome with Spanish failure reasons', () => {
    renderPage({ report: REPORT });

    expect(screen.getByTestId('report-total-filas')).toHaveTextContent('3');
    expect(screen.getByTestId('report-total-creadas')).toHaveTextContent('1');
    expect(screen.getByTestId('report-total-actualizadas')).toHaveTextContent('1');
    expect(screen.getByTestId('report-total-fallidas')).toHaveTextContent('1');

    expect(screen.getByText('Remera Oversize')).toBeInTheDocument();
    expect(screen.getByText('Pantalon Cargo')).toBeInTheDocument();
    expect(screen.getByText('Moneda GBP inválida. Valores permitidos: USD, EUR, MN.')).toBeInTheDocument();
    expect(screen.getAllByText('Creada')).toHaveLength(1);
    expect(screen.getAllByText('Actualizada')).toHaveLength(1);
    expect(screen.getAllByText('Fallida')).toHaveLength(1);
  });
});

describe('ImportarProductosPage (S18)', () => {
  it('renders a Spanish rejection message and NO partial results table', () => {
    const Stub = createRoutesStub([
      { path: '/', Component: () => <ImportarProductosPage error={importErrorMessage(413)} /> },
    ]);
    render(<Stub />);

    expect(screen.getByText(importErrorMessage(413))).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
