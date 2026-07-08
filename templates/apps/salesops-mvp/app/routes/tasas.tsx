import type { Route } from './+types/tasas';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Tasas de cambio — Sales Ops Cockpit' }];
}

export default function Tasas() {
  return (
    <PlaceholderScreen
      heading="Tasas de cambio"
      description="Edición de tasas (USD→MN, Zelle, EUR). Pendiente de implementación."
    />
  );
}
