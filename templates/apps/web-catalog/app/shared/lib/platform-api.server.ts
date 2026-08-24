import { apiIdpBaseUrl, getSession, refreshSession, destroySession } from './session.server';

function unauthorized(setCookie?: string): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: setCookie ? { 'Set-Cookie': setCookie } : undefined,
  });
}

function fetchWithAuth(url: string, init: RequestInit, accessToken: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  // Deliberately NO `X-Company-Id` (design D6) — the platform surface lives
  // OUTSIDE every tenant; no tenant context exists for these calls, and
  // sending one would contradict the guard chain (`JwtAuthGuard →
  // SuperadminGuard`, no TenantContextGuard).
  return fetch(url, { ...init, headers });
}

/**
 * Platform counterpart of `api.server.ts`'s `makeAuthenticatedRequest`
 * (design D6), mirroring it verbatim MINUS the `X-Company-Id` header and
 * against `api-idp` (`apiIdpBaseUrl()`) instead of `api-salesops`: Bearer
 * session token, exactly one refresh-and-retry on a 401
 * (`refreshSession`'s Map de-dupe handles concurrent callers), and a second
 * 401 — or a failing refresh — destroys the session before throwing the 401.
 * Turning "no session / not superadmin" into the login redirect is the
 * `_platform` layout loader's job (identical redirect either way), not this
 * function's.
 */
export async function makePlatformRequest(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const sessionData = await getSession(request);
  if (!sessionData) {
    throw unauthorized();
  }

  const url = `${apiIdpBaseUrl()}${path}`;
  const response = await fetchWithAuth(url, init, sessionData.accessToken);
  if (response.status !== 401) {
    return response;
  }

  let refreshedCookie: string;
  try {
    refreshedCookie = await refreshSession(request);
  } catch {
    throw unauthorized(await destroySession(request));
  }

  const refreshedRequest = new Request(request.url, { headers: { Cookie: refreshedCookie } });
  const refreshedSession = await getSession(refreshedRequest);
  if (!refreshedSession) {
    throw unauthorized(await destroySession(request));
  }

  const retryResponse = await fetchWithAuth(url, init, refreshedSession.accessToken);
  if (retryResponse.status === 401) {
    throw unauthorized(await destroySession(request));
  }

  return retryResponse;
}
