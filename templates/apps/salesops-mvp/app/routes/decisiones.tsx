import type { Route } from './+types/decisiones';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Decisiones — Sales Ops Cockpit' }];
}

export default function Decisiones() {
  return (
    <PlaceholderScreen
      heading="Decisiones"
      description="Dashboard de KPIs para decisiones de negocio. Pendiente de implementación."
    />
  );
}
