import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/_shell.tsx', [
    index('routes/home.tsx'),
    route('pedidos/nuevo', 'routes/pedidos-nuevo.tsx'),
    route('operador-gestores', 'routes/operador-gestores.tsx'),
    route('operador-almacen', 'routes/operador-almacen.tsx'),
    route('tasas', 'routes/tasas.tsx'),
    route('inventario', 'routes/inventario.tsx'),
    route('decisiones', 'routes/decisiones.tsx'),
    route('finanzas', 'routes/finanzas.tsx'),
  ]),
  // Dev-only, not part of the persistent sidebar shell — visit directly.
  route('dev-commissions', 'routes/dev-commissions.tsx'),
] satisfies RouteConfig;
