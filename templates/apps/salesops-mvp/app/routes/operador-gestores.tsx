import type { Route } from './+types/operador-gestores';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Operador de gestores — Sales Ops Cockpit' }];
}

export default function OperadorGestores() {
  return (
    <PlaceholderScreen
      heading="Operador de gestores"
      description="Tablero kanban de pedidos (creado/verificado/transportando/entregado/comisión pagada). Pendiente de implementación."
    />
  );
}
