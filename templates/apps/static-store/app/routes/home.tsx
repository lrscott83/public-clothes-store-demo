import type { Product } from '@store-mgmt/domain';
import { Card } from '@store-mgmt/web-common/client';
import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: 'Static Store' },
    { name: 'description', content: 'A static storefront built on the shared stack.' },
  ];
}

// Wired to the shared domain package to prove the workspace link resolves.
// Replace with real data (a clientLoader, a fetch, etc.) when building out.
const featured: Product[] = [];

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <Card padding="lg" className="max-w-lg text-center">
        <h1 className="text-3xl font-bold text-gray-900">Static Store</h1>
        <p className="mt-3 text-gray-600">
          Scaffolded on the shared React Router 7 + Tailwind stack.
        </p>
        <p className="mt-2 text-sm text-gray-400">
          {featured.length} featured products
        </p>
      </Card>
    </main>
  );
}
