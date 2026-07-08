import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Sales Ops Cockpit' },
    { name: 'description', content: 'Panel interno de gestión de pedidos y operaciones.' },
  ];
}

/**
 * Welcome/overview landing page, rendered INSIDE the `_shell` layout (see
 * app/routes/_shell.tsx) so the sidebar is always visible — this is NOT a
 * chrome-free role picker outside the shell (see design.md, LOCKED decision).
 * Screen-specific content (KPIs, shortcuts) is out of scope for the skeleton.
 */
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Bienvenido al Sales Ops Cockpit</h1>
      <p className="mt-2 text-sm text-text-muted">
        Elegí una pantalla en la barra lateral para empezar.
      </p>
    </main>
  );
}
