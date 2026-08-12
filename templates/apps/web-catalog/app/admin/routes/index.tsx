import { Form } from 'react-router';
import { withAuth } from '../../shared/lib/auth.guards.server';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Admin' }];
}

/**
 * Placeholder `/admin` landing page — proves the session round-trip end to
 * end (login -> withAuth -> here). Real content (product/category CRUD)
 * lands in tasks 6.5-6.7.
 */
export const loader = withAuth(async ({ session }) => {
  return { userId: session.userId };
});

export default function AdminIndexRoute({ loaderData }: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-4">Panel de administración</h1>
        <p className="text-text-muted mb-6">Sesión activa: {loaderData.userId}</p>
        <Form method="post" action="/admin/logout">
          <button type="submit" className="text-sm font-medium text-primary hover:text-primary-hover">
            Cerrar sesión
          </button>
        </Form>
      </div>
    </main>
  );
}
