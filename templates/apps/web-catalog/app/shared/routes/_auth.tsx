import { Outlet } from 'react-router';
import { withAuth } from '../lib/auth.guards.server';

/**
 * Wraps every `/admin` route (design D7/D8) — `withAuth` guarantees a
 * fresh session before any child loader/action runs; `admin/login` and
 * `admin/logout` are registered as SIBLINGS of this layout in
 * `app/routes.ts`, never inside it, so login doesn't guard itself.
 */
export const loader = withAuth(async ({ session }) => {
  return { userId: session.userId };
});

export default function AuthLayout() {
  return <Outlet />;
}
