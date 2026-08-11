import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { ProductsPage } from '../products';
import { defaultStoreConfig } from '../../../shared/config/stores/default.config';
import type { PublicCategoryDto, PublicProductListResponseDto } from '../../../shared/lib/public-api.types';

/**
 * Exposes the current location's search string so tests can assert on it
 * without a full data router (`createMemoryRouter`'s navigation pipeline
 * constructs a client-side `Request`/`AbortSignal` that this repo's
 * jsdom+undici combination cannot construct — a test-environment
 * incompatibility, not a `ProductsPage` bug). Plain `useSearchParams` works
 * identically under a declarative `MemoryRouter`, since it never triggers a
 * loader re-fetch — exactly the property this test cares about.
 */
function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-display">{location.search}</div>;
}

const CATEGORIES: PublicCategoryDto[] = [
  { id: 'cat-1', slug: 'remeras', name: 'Remeras', image: null, order: 1 },
  { id: 'cat-2', slug: 'pantalones', name: 'Pantalones', image: null, order: 2 },
];

function buildResult(overrides: Partial<PublicProductListResponseDto> = {}): PublicProductListResponseDto {
  return {
    items: [
      {
        id: 'product-1',
        name: 'Remera Oversize',
        description: 'Remera de algodón 100%.',
        categoryId: 'cat-1',
        categorySlug: 'remeras',
        price: { amount: '100.00', currency: 'USD' },
        finalPrice: { amount: '100.00', currency: 'USD' },
        percentDiscountPrice: '0.00',
        discountPrice: '0.00',
        isOffer: false,
        isNew: false,
        imageUrl: 'http://localhost:3003/public/products/product-1/image/abc.webp',
        order: 1,
      },
    ],
    page: 1,
    pageSize: 12,
    total: 1,
    pageCount: 1,
    ...overrides,
  };
}

function renderProductsPage(result: PublicProductListResponseDto, initialPath = '/productos') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationDisplay />
      <Routes>
        <Route
          path="/productos"
          element={<ProductsPage config={defaultStoreConfig} result={result} categories={CATEGORIES} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function currentSearch(): string {
  return screen.getByTestId('location-display').textContent ?? '';
}

describe('ProductsPage', () => {
  it('renders the search box, category select, sort select and page-size select', () => {
    renderProductsPage(buildResult());

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument();
    expect(screen.getByLabelText('Ordenar por')).toBeInTheDocument();
    expect(screen.getByLabelText('Mostrar')).toBeInTheDocument();
  });

  it('renders every category as an option, plus "Todas las categorías"', () => {
    renderProductsPage(buildResult());

    const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
    const optionLabels = Array.from(select.options).map((option) => option.text);
    expect(optionLabels).toEqual(['Todas las categorías', 'Remeras', 'Pantalones']);
  });

  it('renders a results counter reflecting result.total', () => {
    renderProductsPage(buildResult({ total: 7 }));
    expect(screen.getByRole('status')).toHaveTextContent('7');
  });

  it('renders the empty state when items is empty', () => {
    renderProductsPage(buildResult({ items: [], total: 0 }));
    expect(screen.getByTestId('product-grid-empty')).toBeInTheDocument();
  });

  it('forwards the initial URL params verbatim into the toolbar controls', () => {
    renderProductsPage(
      buildResult(),
      '/productos?q=remera&categoria=remeras&orden=precio-asc&porPagina=24',
    );

    expect(screen.getByRole('searchbox')).toHaveValue('remera');
    expect(screen.getByLabelText('Categoría')).toHaveValue('remeras');
    expect(screen.getByLabelText('Ordenar por')).toHaveValue('precio-asc');
    expect(screen.getByLabelText('Mostrar')).toHaveValue('24');
  });

  it('changing the category select updates the URL search params and resets pagina', () => {
    renderProductsPage(buildResult(), '/productos?pagina=3');

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'pantalones' } });

    expect(currentSearch()).toContain('categoria=pantalones');
    expect(currentSearch()).not.toContain('pagina');
  });

  it('changing the sort select updates the URL search params', () => {
    renderProductsPage(buildResult());

    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'precio-desc' } });

    expect(currentSearch()).toContain('orden=precio-desc');
  });

  it('changing the page-size select updates the URL search params', () => {
    renderProductsPage(buildResult());

    fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: '48' } });

    expect(currentSearch()).toContain('porPagina=48');
  });

  it('typing in the search box updates the URL search params', () => {
    renderProductsPage(buildResult());

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'azul' } });

    expect(currentSearch()).toContain('q=azul');
  });

  it('renders an ellipsis paginator and navigates to a numbered page, preserving other params', () => {
    renderProductsPage(
      buildResult({ total: 130, page: 5, pageSize: 12 }),
      '/productos?categoria=remeras&pagina=5',
    );

    // 130 items / 12 per page = 11 pages; current=5 renders
    // [1, ellipsis, 4, 5, 6, ellipsis, 11] — "11" (the anchored last page) is
    // always in range, unlike an arbitrary middle page.
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '11' }));

    expect(currentSearch()).toContain('pagina=11');
    expect(currentSearch()).toContain('categoria=remeras');
  });

  it('does not render pagination controls when there is only one page', () => {
    renderProductsPage(buildResult({ total: 1, pageCount: 1 }));
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });
});
