import type { Route } from './+types/pedidos-nuevo';
import { PlaceholderScreen } from '../components/placeholder-screen';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Nuevo pedido — Sales Ops Cockpit' }];
}

export default function PedidosNuevo() {
  return (
    <PlaceholderScreen
      heading="Nuevo pedido"
      description="Flujo de creación de pedido (carrito → cliente → almacén). Pendiente de implementación."
    />
  );
}
