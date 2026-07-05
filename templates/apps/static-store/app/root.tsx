import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type { Route } from './+types/root';
import { ThemeProvider } from '@store-mgmt/storefront/theme';
import { activeConfig, activeTheme, catalog } from './store/active';
import { faviconHref } from './store/favicon';
import { hiddenHomeAnchors, resolveHomeSections } from './store/home-sections';
import { Header } from './components/header';
import { Footer } from './components/footer';

import '@store-mgmt/web-common/styles.css';
import './app.css';

// Declaring an icon link makes the browser use it instead of auto-requesting
// `/favicon.ico` (which has no route and logs a 404). The favicon follows the
// active vertical — Nova's Store glyph in its primary color, clothes' its own.
export const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/svg+xml', href: faviconHref },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={activeConfig.locale} data-vertical={activeConfig.vertical}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider theme={activeTheme} config={activeConfig}>
          {children}
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

// Derived once at module load (catalog + config are static per build): the nav
// anchors whose home-page section won't render, so the header can hide them.
const hiddenAnchors = hiddenHomeAnchors(resolveHomeSections(activeConfig, catalog));

export default function App() {
  return (
    <>
      <Header config={activeConfig} hiddenAnchors={hiddenAnchors} />
      <Outlet />
      <Footer config={activeConfig} />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details =
      error.status === 404
        ? 'The requested page could not be found.'
        : error.statusText || details;
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
