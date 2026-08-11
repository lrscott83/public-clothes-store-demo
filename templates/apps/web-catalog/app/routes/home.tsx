import type { Route } from './+types/home';

/**
 * Spike 0.1b: proves the `Host` header (the tenant-resolution signal,
 * design.md §2) survives from an external `curl` through Vite's dev server
 * into a loader unchanged. Real tenant resolution (host-slug parsing,
 * mirroring `PublicTenantGuard`) lands in Phase 5 — this route is
 * deliberately bare.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return { host: request.headers.get('host') };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <p data-testid="host">Host: {loaderData.host}</p>
    </main>
  );
}
