import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { ProductDetailPage } from '../product-detail';
import { buildStoreConfig } from '../../components/__tests__/test-fixtures';

const config = buildStoreConfig({
  catalog: {
    categories: [{ id: 'shirts', name: 'Shirts' }],
    products: [
      {
        id: '1',
        name: 'Red Shirt',
        description: 'A very nice shirt',
        price: 10,
        categoryId: 'shirts',
        image: '/shirt.jpg',
      },
    ],
  },
});
const catalog = createBakedCatalogProvider(config.catalog);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/productos/:id"
          element={<ProductDetailPage config={config} catalog={catalog} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProductDetailPage', () => {
  it('resolves and renders the matching product client-side by id param', () => {
    renderAt('/productos/1');

    expect(screen.getByRole('heading', { name: 'Red Shirt' })).toBeInTheDocument();
    expect(screen.getByText('A very nice shirt')).toBeInTheDocument();
  });

  it('renders a graceful not-found message for an unknown id, no thrown error', () => {
    renderAt('/productos/does-not-exist');

    expect(screen.getByText(/not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Red Shirt' })).not.toBeInTheDocument();
  });
});
