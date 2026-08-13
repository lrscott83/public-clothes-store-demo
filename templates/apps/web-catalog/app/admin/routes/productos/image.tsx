import { withAuth } from '../../../shared/lib/auth.guards.server';
import { fetchProductImage } from '../../lib/products.server';

/**
 * Resource route: the browser's `<img src>` for an admin thumbnail
 * (design.md D5b).
 *
 * The `<img>` runs in the browser, which holds this app's session cookie and
 * NO Bearer token. Pointing it straight at `api-salesops` would either 401 or
 * force us to ship the token to the client — strictly worse than the problem
 * it solves. So the fetch happens here, server-side, and only a same-origin URL
 * ever reaches the page.
 *
 * This route holds no authorization policy of its own: `withAuth` resolves
 * WHICH company the request is for, and `api-salesops`'s guard chain
 * independently re-checks membership on every call.
 */
export const loader = withAuth(async ({ request, params, companyId }) => {
  const upstream = await fetchProductImage(request, companyId, params.id!);

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
    },
  });
});
