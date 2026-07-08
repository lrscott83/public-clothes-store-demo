import type { Route } from './+types/operador-almacen';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de almacén — Sales Ops Cockpit' }];
}

export default function OperadorAlmacen() {
  return (
    <PlaceholderScreen
      heading="Operador de almacén"
      description="Mismo tablero kanban, filtrado a un almacén. Pendiente de implementación."
    />
  );
}
