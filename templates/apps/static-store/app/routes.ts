import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('productos', 'routes/products.tsx'),
  route('productos/:id', 'routes/product-detail.tsx'),
] satisfies RouteConfig;
