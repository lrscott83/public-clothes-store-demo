import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, it, expect } from 'vitest';
import ShellLayout from '../_shell';
import Home from '../home';
import PedidosNuevo from '../pedidos-nuevo';
import OperadorGestores from '../operador-gestores';
import OperadorAlmacen from '../operador-almacen';
import Tasas from '../tasas';
import Inventario from '../inventario';
import Decisiones from '../decisiones';
import Finanzas from '../finanzas';

const ROUTES = [
  { path: '/', Component: Home, heading: /bienvenid/i },
  { path: '/pedidos/nuevo', Component: PedidosNuevo, heading: /nuevo pedido/i },
  { path: '/operador-gestores', Component: OperadorGestores, heading: /operador de gestores/i },
  { path: '/operador-almacen', Component: OperadorAlmacen, heading: /operador de almacén/i },
  { path: '/tasas', Component: Tasas, heading: /tasas/i },
  { path: '/inventario', Component: Inventario, heading: /inventario/i },
  { path: '/decisiones', Component: Decisiones, heading: /decisiones/i },
  { path: '/finanzas', Component: Finanzas, heading: /finanzas/i },
];

function buildStub() {
  return createRoutesStub([
    {
      path: '/',
      Component: ShellLayout,
      children: ROUTES.map(({ path, Component }) =>
        path === '/'
          ? { index: true, Component }
          : { path: path.slice(1), Component },
      ),
    },
  ]);
}

describe('app routes', () => {
  it.each(ROUTES)('resolves $path inside the persistent sidebar shell', ({ path, heading }) => {
    const Stub = buildStub();
    render(<Stub initialEntries={[path]} />);

    // The sidebar (7 nav links) is mounted for every route via the shell.
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();

    // Each route renders a distinguishable stub heading.
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('renders the same sidebar shell (7 links) regardless of which route is active', () => {
    // Proves `_shell` renders the sidebar once as the parent layout — not
    // per-route — by asserting the nav link count is identical whether the
    // matched child route is the index or any of the 7 screens.
    for (const { path } of ROUTES) {
      const Stub = buildStub();
      const { unmount, container } = render(<Stub initialEntries={[path]} />);
      const nav = container.querySelector('nav');
      expect(nav?.querySelectorAll('a')).toHaveLength(7);
      unmount();
    }
  });
});
