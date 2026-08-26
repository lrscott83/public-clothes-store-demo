import { redirect } from 'react-router';
import type { Route } from './+types/index';

/**
 * The tenant storefront's DEFAULT view IS the catalog (owner decision).
 * A permanent-style redirect keeps ONE canonical catalog URL (`/productos`)
 * so filter/pagination state always lives under a shareable address.
 */
export async function loader() {
  throw redirect('/productos');
}

export default function IndexRoute() {
  return null;
}
