import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderPage() {
  return render(
    <MemoryRouter>
      <ProductsPage config={config} catalog={catalog} />
    </MemoryRouter>,
  );
}

describe('ProductsPage', () => {
  it('renders products across all categories by default', () => {
    renderPage();
    expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    expect(screen.getByText('Blue Pants')).toBeInTheDocument();
  });

  it('filters to the category chosen in the category select', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Category'), 'shirts');

    expect(screen.getByText('Red Shirt')).toBeInTheDocument();
    expect(screen.queryByText('Blue Pants')).not.toBeInTheDocument();
  });

  it('narrows results by search query over name and description', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Search products…'), 'pants');

    expect(screen.getByText('Blue Pants')).toBeInTheDocument();
    expect(screen.queryByText('Red Shirt')).not.toBeInTheDocument();
  });

  it('reorders products when a sort option is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(screen.getByLabelText('Sort by'), 'price-desc');

    const names = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    expect(names).toEqual(['Blue Pants', 'Red Shirt']);
  });

  it('shows the filtered results count', () => {
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('2 products');
  });

  it('shows the localized empty message when nothing matches the search', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Search products…'), 'zzz');

    expect(screen.getByTestId('product-grid-empty')).toHaveTextContent(
      'No products match your filters.',
    );
  });

  function renderCatalog(count: number) {
    const products = Array.from({ length: count }, (_, index) => ({
      id: `p${index}`,
      name: `Product ${index}`,
      description: 'desc',
      price: index + 1,
      categoryId: 'shirts',
      image: '/p.jpg',
    }));
    const cfg = buildStoreConfig({
      catalog: { categories: [{ id: 'shirts', name: 'Shirts' }], products },
    });
    return render(
      <MemoryRouter>
        <ProductsPage config={cfg} catalog={createBakedCatalogProvider(cfg.catalog)} />
      </MemoryRouter>,
    );
  }

  it('renders an ellipsis in the pager when there are more than five pages', () => {
    renderCatalog(80); // 80 / 12 = 7 pages
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getByText('…')).toBeInTheDocument();
    // Exactly five numbered page buttons stay visible.
    const numberButtons = within(pager)
      .getAllByRole('button')
      .filter((button) => /^\d+$/.test(button.textContent ?? ''));
    expect(numberButtons).toHaveLength(5);
  });

  it('omits the prev/next arrows when there is only a single page', () => {
    renderCatalog(3); // fits on one page
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(within(pager).queryByRole('button', { name: 'Previous' })).not.toBeInTheDocument();
    expect(within(pager).queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('recomputes the pager when the page size changes', async () => {
    const user = userEvent.setup();
    renderCatalog(15); // 15 / 12 = 2 pages
    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    expect(within(pager).getByRole('button', { name: '2' })).toBeInTheDocument();

    // 15 / 24 = 1 page → the second page and the arrows disappear.
    await user.selectOptions(screen.getByLabelText('Show'), '24');
    expect(within(pager).queryByRole('button', { name: '2' })).not.toBeInTheDocument();
    expect(within(pager).queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });

  it('paginates when more products exist than the page size, without an out-of-range page', async () => {
    const user = userEvent.setup();
    const manyProducts = Array.from({ length: 15 }, (_, index) => ({
      id: `p${index}`,
      name: `Product ${index}`,
      description: 'desc',
      price: index + 1,
      categoryId: 'shirts',
      image: '/p.jpg',
    }));
    const bigConfig = buildStoreConfig({
      catalog: { categories: [{ id: 'shirts', name: 'Shirts' }], products: manyProducts },
    });
    const bigCatalog = createBakedCatalogProvider(bigConfig.catalog);

    render(
      <MemoryRouter>
        <ProductsPage config={bigConfig} catalog={bigCatalog} />
      </MemoryRouter>,
    );

    const pager = screen.getByRole('navigation', { name: 'Pagination' });
    // 15 products at 12/page → 2 pages.
    expect(within(pager).getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(within(pager).queryByRole('button', { name: '3' })).not.toBeInTheDocument();

    // Page 1 shows the first 12 cards; page 2 shows the remaining 3.
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(12);
    await user.click(within(pager).getByRole('button', { name: '2' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
  });
});
