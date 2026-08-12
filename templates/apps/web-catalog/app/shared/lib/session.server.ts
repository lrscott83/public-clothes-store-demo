import { createCookieSessionStorage, redirect } from 'react-router';

/**
 * `web-catalog`'s admin session (design.md D8). Rewritten in intent from
 * poolops's `session.server.ts`, narrowed for a single-tenant-per-subdomain
 * app: no `activeCompanyId` (the subdomain already fixes the store; a
 * switcher would contradict it) and no cross-app `returnTo` origin
 * allow-listing (this app never redirects to another app's origin).
 */
export interface SessionData {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

const SESSION_COOKIE_NAME = '__store_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Built fresh per call, not cached at module scope, so a missing
 * `SESSION_SECRET` fails loudly the first time a request actually needs a
 * session (D8: "boot fails if unset") instead of the module import
 * silently succeeding with an undefined secret.
 */
function getSessionStorage() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET must be set');
  }

  return createCookieSessionStorage<SessionData>({
    cookie: {
      name: SESSION_COOKIE_NAME,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE_SECONDS,
      secrets: [secret],
      // `domain` intentionally omitted — LOAD-BEARING (D8). Setting it
      // would share one session across every tenant subdomain: an owner
      // logged into store A would arrive at store B's /admin already
      // authenticated.
    },
  });
}

export async function createSession(
  accessToken: string,
  refreshToken: string,
  userId: string,
  redirectTo = '/admin',
): Promise<Response> {
  const storage = getSessionStorage();
  const session = await storage.getSession();
  session.set('accessToken', accessToken);
  session.set('refreshToken', refreshToken);
  session.set('userId', userId);

  return redirect(redirectTo, {
    headers: { 'Set-Cookie': await storage.commitSession(session) },
  });
}

export async function getSession(request: Request): Promise<SessionData | null> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get('Cookie'));

  const accessToken = session.get('accessToken');
  const refreshToken = session.get('refreshToken');
  const userId = session.get('userId');

  if (!accessToken || !refreshToken || !userId) {
    return null;
  }

  return { accessToken, refreshToken, userId };
}

export async function updateSessionTokens(
  request: Request,
  accessToken: string,
  refreshToken: string,
): Promise<string> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get('Cookie'));
  session.set('accessToken', accessToken);
  session.set('refreshToken', refreshToken);
  return storage.commitSession(session);
}

export async function destroySession(request: Request): Promise<string> {
  const storage = getSessionStorage();
  const session = await storage.getSession(request.headers.get('Cookie'));
  return storage.destroySession(session);
}

/**
 * Decodes a JWT's `exp` claim locally — no HTTP call. A 5s buffer avoids
 * the token expiring between this check and the API call it guards.
 * Exported (unlike poolops's module-private version) so the buffer's edge
 * case is provable directly, not just through `ensureValidSession`.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp * 1000 < Date.now() + 5000;
  } catch {
    return true;
  }
}

const DEFAULT_API_IDP_URL = 'http://localhost:3002';

export function apiIdpBaseUrl(): string {
  return process.env.API_IDP_URL ?? DEFAULT_API_IDP_URL;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Cache of in-flight/recently-completed refreshes, keyed by the OLD refresh
 * token. Fixes a real React Router 7 race: parallel loaders (layout + child)
 * can both see the same expired access token in one request cycle: without
 * de-dupe, the second caller would refresh with a refresh token the first
 * caller already consumed, and the IDP would reject it (design D8, ported
 * from poolops's fix for the identical race).
 */
const refreshCache = new Map<string, Promise<string>>();

export async function refreshSession(request: Request): Promise<string> {
  const sessionData = await getSession(request);
  if (!sessionData) {
    throw new Error('No session to refresh');
  }

  const oldRefreshToken = sessionData.refreshToken;

  const cached = refreshCache.get(oldRefreshToken);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const response = await fetch(`${apiIdpBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: oldRefreshToken }),
      });
      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const { accessToken, refreshToken } = (await response.json()) as RefreshResponse;
      return updateSessionTokens(request, accessToken, refreshToken);
    } catch (err) {
      // Remove from cache immediately on error so callers can retry.
      refreshCache.delete(oldRefreshToken);
      throw err;
    }
  })();

  refreshCache.set(oldRefreshToken, promise);

  // Auto-clean well beyond the window where parallel loaders could arrive,
  // but short enough to avoid stale entries lingering.
  promise
    .then(() => {
      setTimeout(() => refreshCache.delete(oldRefreshToken), 30000);
    })
    .catch(() => {
      // Error already handled above.
    });

  return promise;
}
