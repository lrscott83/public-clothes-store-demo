import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import { Footer } from './shared/components/footer';
import { Header } from './shared/components/header';
import { isPlatformAdminHost } from './shared/lib/tenant.server';
import { resolveStoreConfig } from './shared/lib/store-config.server';
import { themeColorsToCssVars } from './shared/lib/theme-css-vars';

import '@store-mgmt/web-common/styles.css';
import './app.css';

/**
 * Resolves the tenant's `StoreConfig` from the request Host (design.md D9) —
 * an unknown/malformed subdomain throws a 404 `Response` here, caught by
 * `ErrorBoundary` below. Every route re-resolves this independently (see
 * `store-config.server.ts`'s own comment) rather than threading it through
 * `useRouteLoaderData('root')`, so a direct hit on any route still 404s
 * correctly with zero cross-route coupling.
 *
 * PLATFORM BRANCH (design D4): on the reserved `admin` host label, tenant/
 * store resolution is SKIPPED entirely — only the platform routes
 * (`/tiendas`, `/tiendas/nueva`) are served. `/tiendas*` paths return a
 * `{ platform: true }` marker (the `_platform` layout takes over); ANY other
 * admin-host path (`/`, `/productos`, …) redirects to `/tiendas`. The root
 * loader runs BEFORE child loaders, so a statically-matching tenant route is
 * intercepted before any tenant resolution can happen. Non-admin hosts keep
 * the exact pre-existing behavior, untouched.
 */
export async function loader({ request }: Route.LoaderArgs) {
  if (isPlatformAdminHost(request)) {
    const { pathname } = new URL(request.url);
    if (pathname === '/tiendas' || pathname.startsWith('/tiendas/')) {
      return { platform: true };
    }
    throw redirect('/tiendas');
  }

  const config = resolveStoreConfig(request);
  return { config };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  // Platform branch (design D4): a minimal shell — Header/Footer require a
  // `StoreConfig` that does not exist (and must never resolve) on the admin
  // host.
  if ('platform' in loaderData) {
    return (
      <div data-testid="platform-shell" className="min-h-screen">
        <Outlet />
      </div>
    );
  }

  const { config } = loaderData;
  const cssVars = themeColorsToCssVars(config.theme.colors);
  const declarations = Object.entries(cssVars)
    .map(([name, value]) => `${name}: ${value};`)
    .join(' ');

  return (
    <>
      {declarations && (
        <style data-store-theme dangerouslySetInnerHTML={{ __html: `:root { ${declarations} }` }} />
      )}
      <Header config={config} />
      <Outlet />
      <Footer config={config} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'Ocurrió un error inesperado.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details = error.status === 404 ? 'La página que buscás no existe.' : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
