import type { Route } from './+types/inventario';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Inventario — Sales Ops Cockpit' }];
}

export default function Inventario() {
  return (
    <PlaceholderScreen
      heading="Inventario"
      description="Resumen de 3 almacenes, detalle y valor de costo. Pendiente de implementación."
    />
  );
}
