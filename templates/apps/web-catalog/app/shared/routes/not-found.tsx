import type { Route } from './+types/not-found';

/**
 * Catch-all (design.md D9/D10). Any request that matches no other route —
 * a browser probing `/.well-known/*`, a stale bookmark, a mistyped URL,
 * etc. — returns a clean 404 `Response`. Without this route the SSR router
 * threw an unhandled "No route matches URL" error with a stack trace on
 * every unmatched request (notably `/.well-known/appspecific/...` from
 * Chrome DevTools tooling, which also spiked the CPU during dev startup
 * while those requests were processed).
 */
export async function loader(_args: Route.LoaderArgs) {
  throw new Response('Not found', { status: 404 });
}

// SSG/typegen requires a component export even though `loader` throws for
// every request, so this body is never rendered. Keeping it minimal keeps
// the 404 response text-light and avoids a full HTML shell for probes.
export default function NotFoundRoute() {
  return null;
}
