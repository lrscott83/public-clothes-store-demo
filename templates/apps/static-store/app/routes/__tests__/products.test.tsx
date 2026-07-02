import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { createBakedCatalogProvider } from '@store-mgmt/storefront/catalog';
import { ProductsPage } from '../products';
import { buildStoreConfig } from '../../components/__tests__/test-fixtures';

const config = buildStoreConfig({
  catalog: {
    categories: [
      { id: 'shirts', name: 'Shirts' },
      { id: 'pants', name: 'Pants' },
    ],
    products: [
      {
        id: '1',
        name: 'Red Shirt',
        description: 'A shirt',
        price: 10,
        categoryId: 'shirts',
        image: '/shirt.jpg',
      },
      {
        id: '2',
        name: 'Blue Pants',
        description: 'Some pants',
        price: 20,
        categoryId: 'pants',
        image: '/pants.jpg',
      },
    ],
  },
});
const catalog = createBakedCatalogProvider(config.catalog);

describe('ProductsPage', () => {
  it('renders products across all categories by default', () => {
    render(
      <MemoryRouter>
        <ProductsPage config={config} catalog={catalog} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    expect(screen.getByText('Blue Pants')).toBeInTheDocument();
  });

  it('shows only products matching the selected category', () => {
    render(
      <MemoryRouter>
        <ProductsPage config={config} catalog={catalog} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shirts' }));

    expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    expect(screen.queryByText('Blue Pants')).not.toBeInTheDocument();
  });

  it('shows products across all categories again when "All" is selected', () => {
    render(
      <MemoryRouter>
        <ProductsPage config={config} catalog={catalog} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shirts' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    expect(screen.getByText('Blue Pants')).toBeInTheDocument();
  });
});
