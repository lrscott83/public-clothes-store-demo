import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  route('productos', 'catalog/routes/products.tsx'),
  route('productos/:id', 'catalog/routes/product-detail.tsx'),
] satisfies RouteConfig;
