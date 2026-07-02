import { useState } from 'react';
import type { StoreConfig } from '@store-mgmt/storefront/config';
import type { CatalogProvider } from '@store-mgmt/storefront/catalog';
import { ProductGrid } from '../components/product-grid';
import { activeConfig, catalog } from '../store/active';
import type { Route } from './+types/products';

export function meta(_args: Route.MetaArgs) {
  return [{ title: `Productos - ${activeConfig.brand.name}` }];
}

const ALL_CATEGORY = '';

export interface ProductsPageProps {
  config: StoreConfig;
  catalog: CatalogProvider;
}

/**
 * Config-driven catalog page. Category filtering is owned HERE (not inside
 * `ProductGrid`, which stays purely presentational — see the Slice 3
 * apply-progress deviation notes): filter state lives in this route, and the
 * already-filtered product list is handed down to `ProductGrid`.
 */
export function ProductsPage({ config, catalog }: ProductsPageProps) {
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const categories = catalog.getCategories();
  const products =
    selectedCategory === ALL_CATEGORY
      ? catalog.getProducts()
      : catalog.getProductsByCategory(selectedCategory);

  return (
    <main className="pt-16 min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-64 shrink-0">
            <div className="bg-surface p-6 rounded-lg shadow-card space-y-1">
              <h2 className="text-lg font-semibold text-text mb-3">Categories</h2>
              <CategoryButton
                label="All"
                active={selectedCategory === ALL_CATEGORY}
                onClick={() => setSelectedCategory(ALL_CATEGORY)}
              />
              {categories.map((category) => (
                <CategoryButton
                  key={category.id}
                  label={category.name}
                  active={selectedCategory === category.id}
                  onClick={() => setSelectedCategory(category.id)}
                />
              ))}
            </div>
          </aside>

          <div className="flex-1">
            <ProductGrid products={products} locale={config.locale} currency={config.currency} />
          </div>
        </div>
      </div>
    </main>
  );
}

function CategoryButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`block w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? 'bg-primary-light text-primary' : 'text-text hover:bg-background'
      }`}
    >
      {label}
    </button>
  );
}

export default function ProductsRoute() {
  return <ProductsPage config={activeConfig} catalog={catalog} />;
}
