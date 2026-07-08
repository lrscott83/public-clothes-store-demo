import type { Route } from './+types/finanzas';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Finanzas — Sales Ops Cockpit' }];
}

export default function Finanzas() {
  return (
    <PlaceholderScreen
      heading="Finanzas"
      description="Dashboard de KPIs financieros. Pendiente de implementación."
    />
  );
}
