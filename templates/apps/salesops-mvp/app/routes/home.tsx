import type { Route } from './+types/home';
import { ProductCard } from '../components/product-card';
import { catalogProvider, resolveCatalogImage } from '../data/catalog';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Sales Ops Cockpit' },
    { name: 'description', content: 'Panel interno de gestión de pedidos y operaciones.' },
  ];
}

// Smoke proof that the local catalog + ProductCard wiring works end to end
// (design.md Task 4.6) — not the real "Nuevo pedido" screen, which Task 3
// implements later against this same catalog data.
const sampleProduct = catalogProvider.getProducts()[0];

/**
 * Welcome/overview landing page, rendered INSIDE the `_shell` layout (see
 * app/routes/_shell.tsx) so the sidebar is always visible — this is NOT a
 * chrome-free role picker outside the shell (see design.md, LOCKED decision).
 * Screen-specific content (KPIs, shortcuts) is out of scope for the skeleton.
 */
export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Bienvenido al Sales Ops Cockpit</h1>
      <p className="mt-2 text-sm text-text-muted">
        Elegí una pantalla en la barra lateral para empezar.
      </p>

      {sampleProduct && (
        <div className="mt-8 max-w-xs">
          <ProductCard
            product={{ ...sampleProduct, image: resolveCatalogImage(sampleProduct.image) }}
            locale="es-NI"
            currency="NIO"
          />
        </div>
      )}
    </main>
  );
}
