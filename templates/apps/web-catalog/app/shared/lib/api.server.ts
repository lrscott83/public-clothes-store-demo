import { getSession, refreshSession, destroySession } from './session.server';

const DEFAULT_API_SALESOPS_URL = 'http://localhost:3001';

function apiSalesopsBaseUrl(): string {
  return process.env.API_SALESOPS_URL ?? DEFAULT_API_SALESOPS_URL;
}

function unauthorized(setCookie?: string): Response {
  return new Response('Unauthorized', {
    status: 401,
    headers: setCookie ? { 'Set-Cookie': setCookie } : undefined,
  });
}

function fetchWithBearer(url: string, init: RequestInit, accessToken: string): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(url, { ...init, headers });
}

/**
 * Calls `api-salesops` with the session's access token as a Bearer header
 * (design.md D7: authorization is resolved server-side by `api-salesops`;
 * this app carries no authoritative copy of it). A 401 triggers exactly one
 * refresh (`refreshSession`'s own Map de-dupe handles concurrent callers
 * sharing the same expired token) and one retry; a second 401 — or the
 * refresh call itself failing — means the refresh token is no longer
 * valid, so the session is destroyed and a 401 is thrown. Turning "no
 * session" into a login redirect is `withAuth`'s job (auth.guards.server.ts,
 * task 6.4), not this function's.
 */
export async function makeAuthenticatedRequest(
  request: Request,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const sessionData = await getSession(request);
  if (!sessionData) {
    throw unauthorized();
  }

  const url = `${apiSalesopsBaseUrl()}${path}`;
  const response = await fetchWithBearer(url, init, sessionData.accessToken);
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

  const retryResponse = await fetchWithBearer(url, init, refreshedSession.accessToken);
  if (retryResponse.status === 401) {
    throw unauthorized(await destroySession(request));
  }

  return retryResponse;
}
