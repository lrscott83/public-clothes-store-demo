import { redirect } from 'react-router';
import { destroySession } from '../lib/session.server';
import type { Route } from './+types/logout';

/**
 * `/admin/logout` — action-only (POST via a `<Form>`, never a bare link,
 * so logout can't be triggered by a GET/prefetch). Sits OUTSIDE the
 * `_auth.tsx` layout, same as `login.tsx` (design D7) — logging out an
 * already-unauthenticated visitor is harmless, not an error.
 */
export async function action({ request }: Route.ActionArgs) {
  const cookie = await destroySession(request);
  return redirect('/admin/login', { headers: { 'Set-Cookie': cookie } });
}
