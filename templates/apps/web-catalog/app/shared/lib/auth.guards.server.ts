import type { LoaderFunctionArgs } from 'react-router';
import { data, redirect } from 'react-router';
import { getSession, isTokenExpired, refreshSession, destroySession, type SessionData } from './session.server';
import { getRequestHostSlug } from './tenant.server';
import { resolveCompanyId } from './company.server';

const LOGIN_PATH = '/admin/login';

export interface AuthenticatedLoaderArgs extends LoaderFunctionArgs {
  session: SessionData;
  companyId: string;
}

type AuthenticatedLoader<T> = (args: AuthenticatedLoaderArgs) => Promise<T> | T;

/**
 * Guarantees a valid session AND a resolved `companyId` before the wrapped
 * loader/action runs (design.md D7). This app only guarantees
 * AUTHENTICATION — a session exists, its access token is fresh, and the
 * subdomain's tenant is resolved to a real `companyId` (task 6.5's design
 * gap: `api-salesops` needs it explicitly as `X-Company-Id`, see
 * `company.server.ts`). It deliberately does NOT check roles: authorization
 * is resolved server-side by `api-salesops` per request (`TenantContextGuard`
 * + `Membership`), and a `403` from there renders as a "no permission" page.
 * `withRoles`/`withPublicRedirect`/`withOptionalAuth` are not ported — no
 * use case for them here.
 *
 * Generic over the wrapped loader's return type `T` (rather than
 * `unknown`) so `react-router typegen` can still infer each route's real
 * `loaderData` shape through the wrapper.
 */
export function withAuth<T>(loader: AuthenticatedLoader<T>) {
  return async (args: LoaderFunctionArgs) => {
    const { request } = args;

    const session = await getSession(request);
    if (!session) {
      throw redirect(loginRedirectTarget(request));
    }

    let effectiveRequest = request;
    let effectiveSession = session;
    let refreshedCookie: string | undefined;

    if (isTokenExpired(session.accessToken)) {
      try {
        refreshedCookie = await refreshSession(request);
      } catch {
        throw await redirectToLoginAndDestroy(request);
      }

      effectiveRequest = new Request(request.url, { headers: { Cookie: refreshedCookie } });
      const refreshedSession = await getSession(effectiveRequest);
      if (!refreshedSession) {
        throw await redirectToLoginAndDestroy(request);
      }
      effectiveSession = refreshedSession;
    }

    // The root loader already resolved this exact Host to a known
    // StoreConfig before this layout's loader ever runs — an unresolvable
    // slug here means the static config and the database have drifted, a
    // genuine server misconfiguration, not a user-facing 404.
    const slug = getRequestHostSlug(request);
    if (!slug) {
      throw new Response('Company not resolved', { status: 500 });
    }
    const companyId = await resolveCompanyId(slug, effectiveSession.accessToken);

    const result = await loader({ ...args, request: effectiveRequest, session: effectiveSession, companyId });

    if (!refreshedCookie) {
      return result;
    }
    if (result instanceof Response) {
      result.headers.append('Set-Cookie', refreshedCookie);
      return result;
    }
    return data(result, { headers: { 'Set-Cookie': refreshedCookie } });
  };
}

function loginRedirectTarget(request: Request): string {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

async function redirectToLoginAndDestroy(request: Request): Promise<Response> {
  const clearCookie = await destroySession(request);
  return redirect(loginRedirectTarget(request), {
    headers: { 'Set-Cookie': clearCookie },
  });
}
