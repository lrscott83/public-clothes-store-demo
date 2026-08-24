import { Outlet, redirect } from 'react-router';
import { isPlatformAdminHost } from '../lib/tenant.server';
import { makePlatformRequest } from '../lib/platform-api.server';

/**
 * Platform console layout (design D4/D6) — served on the reserved `admin`
 * host label ONLY. Two independent gates:
 *
 * 1. Defense-in-depth host check: routes are host-agnostic in React Router,
 *    so this loader throws THE SAME generic 404 as `store-config.server.ts`
 *    when the host is NOT admin — a tenant host hitting `/tiendas` reveals
 *    nothing (identical status and body to any unknown storefront path).
 *
 * 2. Session-only guard (spec: "Console Session Guard and Non-Superadmin
 *    Handling"): the layout calls `GET /platform/companies` via
 *    `makePlatformRequest` — a valid session is required but NO `companyId`
 *    is ever resolved from the host (no `withAuth`). Superadmin verification
 *    happens server-side per request: a `403` from api-idp and an
 *    anonymous/expired session produce the IDENTICAL `/admin/login?returnTo=…`
 *    redirect — same status, same destination, leaking nothing about the
 *    platform surface. The list data flows to children through `Outlet`
 *    context (`/tiendas` renders it; `/tiendas/nueva` ignores it).
 */
export async function loader({ request }: { request: Request }) {
  if (!isPlatformAdminHost(request)) {
    throw new Response('Not Found', { status: 404 });
  }

  const loginTarget = loginRedirectTarget(request);

  let response: Response;
  try {
    response = await makePlatformRequest(request, '/platform/companies');
  } catch (err) {
    if (err instanceof Response && err.status === 401) {
      // Session missing/expired/unrecoverable — destroy cookie travels along.
      throw redirect(loginTarget, { headers: err.headers });
    }
    throw err;
  }

  if (!response.ok) {
    // Non-superadmin (403) or any other rejection → SAME redirect as
    // anonymous. No body, no hint.
    throw redirect(loginTarget);
  }

  const companies = (await response.json()) as Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    type: 'catalog' | null;
  }>;
  return { companies };
}

function loginRedirectTarget(request: Request): string {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return `/admin/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export default function PlatformLayout() {
  return (
    <div data-testid="platform-shell" className="min-h-screen bg-background">
      <header className="border-b p-4">
        <h1 className="text-xl font-semibold">Administración de plataforma</h1>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
