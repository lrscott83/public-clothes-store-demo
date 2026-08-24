import { Outlet } from 'react-router';
import { isPlatformAdminHost } from '../lib/tenant.server';

/**
 * Platform console layout (design D4/D6) — served on the reserved `admin`
 * host label ONLY. Defense-in-depth: routes are host-agnostic in React
 * Router, so this loader independently throws THE SAME generic 404 as
 * `store-config.server.ts` when the host is NOT admin — a tenant host
 * hitting `/tiendas` reveals nothing (identical status and body to any
 * unknown storefront path). Session/superadmin verification is layered on
 * top of this by the platform data loaders (see `platform-api.server.ts`).
 */
export async function loader({ request }: { request: Request }) {
  if (!isPlatformAdminHost(request)) {
    throw new Response('Not Found', { status: 404 });
  }
  return null;
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
