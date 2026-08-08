import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { HomePage } from '../home';
import { buildStoreConfig } from '../../components/__tests__/test-fixtures';

const config = buildStoreConfig({
  hero: { image: '/hero.jpg', heading: 'Welcome', subheading: 'Shop now' },
  features: [{ icon: 'Star', title: 'Curated', description: 'Hand-picked products' }],
  catalog: {
    categories: [{ id: 'cat', name: 'Category' }],
    products: [
      {
        id: '1',
        name: 'Discounted Item',
        description: 'On sale',
        price: 10,
        categoryId: 'cat',
        image: '/a.jpg',
        discount: 20,
      },
      {
        id: '2',
        name: 'New Item',
        description: 'Fresh',
        price: 15,
        categoryId: 'cat',
        image: '/b.jpg',
        isNew: true,
      },
      {
        id: '3',
        name: 'Regular Item',
        description: 'Plain',
        price: 5,
        categoryId: 'cat',
        image: '/c.jpg',
      },
    ],
  },
});
const catalog = createBakedCatalogProvider(config.catalog);

function renderHome(cfg = config, cat = catalog) {
  return render(
    <MemoryRouter>
      <HomePage config={cfg} catalog={cat} />
    </MemoryRouter>,
  );
}

describe('HomePage', () => {
  it('renders the hero heading from config', () => {
    renderHome();
    expect(screen.getByRole('heading', { name: 'Welcome', level: 1 })).toBeInTheDocument();
  });

  it('renders configured features', () => {
    renderHome();
    expect(screen.getByText('Curated')).toBeInTheDocument();
    expect(screen.getByText('Hand-picked products')).toBeInTheDocument();
  });

  it('renders a discounted-products strip showing only discounted products', () => {
    renderHome();
    expect(screen.getByText('Discounted Item')).toBeInTheDocument();
    expect(screen.queryByText('Regular Item')).not.toBeInTheDocument();
  });

  it('renders a new-products strip showing only new products', () => {
    renderHome();
    expect(screen.getByText('New Item')).toBeInTheDocument();
  });

  it('omits the features section entirely when config has none', () => {
    const noFeatures = buildStoreConfig({ ...config, features: undefined });
    const noFeaturesCatalog = createBakedCatalogProvider(noFeatures.catalog);
    renderHome(noFeatures, noFeaturesCatalog);
    expect(screen.queryByText('Curated')).not.toBeInTheDocument();
  });
});
