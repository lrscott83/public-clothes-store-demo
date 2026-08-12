import type { LoaderFunctionArgs } from 'react-router';
import { data, redirect } from 'react-router';
import { getSession, isTokenExpired, refreshSession, destroySession, type SessionData } from './session.server';

const LOGIN_PATH = '/admin/login';

export interface AuthenticatedLoaderArgs extends LoaderFunctionArgs {
  session: SessionData;
}

type AuthenticatedLoader<T> = (args: AuthenticatedLoaderArgs) => Promise<T> | T;

/**
 * Guarantees a valid session before the wrapped loader/action runs
 * (design.md D7). This app only guarantees AUTHENTICATION — a session
 * exists and its access token is fresh. It deliberately does NOT check
 * roles: authorization is resolved server-side by `api-salesops` per
 * request (`TenantContextGuard` + `Membership`), and a `403` from there
 * renders as a "no permission" page. `withRoles`/`withPublicRedirect`/
 * `withOptionalAuth` are not ported — no use case for them here.
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

    if (!isTokenExpired(session.accessToken)) {
      return loader({ ...args, session });
    }

    let refreshedCookie: string;
    try {
      refreshedCookie = await refreshSession(request);
    } catch {
      throw await redirectToLoginAndDestroy(request);
    }

    const refreshedRequest = new Request(request.url, { headers: { Cookie: refreshedCookie } });
    const refreshedSession = await getSession(refreshedRequest);
    if (!refreshedSession) {
      throw await redirectToLoginAndDestroy(request);
    }

    const result = await loader({ ...args, request: refreshedRequest, session: refreshedSession });

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
