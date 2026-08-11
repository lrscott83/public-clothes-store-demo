import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('productos', 'catalog/routes/products.tsx'),
] satisfies RouteConfig;
