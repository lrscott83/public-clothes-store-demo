import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('productos', 'catalog/routes/products.tsx'),
  route('productos/:id', 'catalog/routes/product-detail.tsx'),

  // admin/login and admin/logout sit OUTSIDE the _auth.tsx layout —
  // design.md §6: with one app (unlike poolops's separate web-idp), login
  // must be a sibling of the guarded block or it guards itself.
  route('admin/login', 'shared/routes/login.tsx'),
  route('admin/logout', 'shared/routes/logout.tsx'),
  // Platform console (design D4) — served on the reserved `admin` host only.
  // A SIBLING branch outside `_auth.tsx`, mirroring admin/login's pattern:
  // its session guard is its own (`_platform.tsx` + `platform-api.server.ts`),
  // never the tenant-scoped `withAuth`.
  layout('shared/routes/_platform.tsx', [
    route('tiendas', 'platform/routes/tiendas.tsx'),
    route('tiendas/nueva', 'platform/routes/tiendas-nueva.tsx'),
  ]),
  layout('shared/routes/_auth.tsx', [
    route('admin', 'admin/routes/index.tsx'),
    route('admin/productos', 'admin/routes/productos/index.tsx'),
    route('admin/productos/nuevo', 'admin/routes/productos/nuevo.tsx'),
    route('admin/productos/:id/editar', 'admin/routes/productos/editar.tsx'),
    route('admin/productos/:id/image', 'admin/routes/productos/image.tsx'),
    route('admin/categorias', 'admin/routes/categorias/index.tsx'),
    route('admin/categorias/nueva', 'admin/routes/categorias/nueva.tsx'),
    route('admin/categorias/:id/editar', 'admin/routes/categorias/editar.tsx'),
    route('admin/categorias/:id/image', 'admin/routes/categorias/image.tsx'),
  ]),
] satisfies RouteConfig;
