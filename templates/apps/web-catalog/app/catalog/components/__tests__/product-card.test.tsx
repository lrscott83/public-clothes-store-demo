import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProductCard } from '../product-card';
import type { PublicProductDto } from '../../../shared/lib/public-api.types';

const BASE_ITEM: PublicProductDto = {
  id: 'product-1',
  name: 'Remera Oversize',
  description: 'Remera de algodón 100%.',
  categoryId: 'category-1',
  categorySlug: 'remeras',
  price: { amount: '100.00', currency: 'USD' },
  finalPrice: { amount: '100.00', currency: 'USD' },
  percentDiscountPrice: '0.00',
  discountPrice: '0.00',
  isOffer: false,
  isNew: false,
  imageUrl: 'http://localhost:3003/public/products/product-1/image/abc.webp',
  order: 1,
};

function renderCard(item: PublicProductDto, locale = 'en-US') {
  return render(
    <MemoryRouter>
      <ProductCard item={item} locale={locale} />
    </MemoryRouter>,
  );
}

describe('ProductCard', () => {
  it('renders the name, description and image', () => {
    renderCard(BASE_ITEM);

    expect(screen.getByText(BASE_ITEM.name)).toBeInTheDocument();
    expect(screen.getByText(BASE_ITEM.description)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: BASE_ITEM.name })).toHaveAttribute(
      'src',
      BASE_ITEM.imageUrl,
    );
  });

  it('shows only the price when the product is not an offer — no strike-through sibling', () => {
    renderCard(BASE_ITEM);

    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.queryByTestId('product-card-original-price')).not.toBeInTheDocument();
  });

  it('shows finalPrice in accent + the original price struck through, ONLY when isOffer', () => {
    const item: PublicProductDto = {
      ...BASE_ITEM,
      price: { amount: '100.00', currency: 'USD' },
      finalPrice: { amount: '75.00', currency: 'USD' },
      percentDiscountPrice: '20.00',
      discountPrice: '5.00',
      isOffer: true,
    };
    renderCard(item);

    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByTestId('product-card-original-price')).toHaveTextContent('$100.00');
  });

  it('renders the green "Nuevo" badge when isNew', () => {
    renderCard({ ...BASE_ITEM, isNew: true });
    expect(screen.getByTestId('product-badge-new')).toHaveTextContent('Nuevo');
  });

  it('renders the red -X% badge when percentDiscountPrice > 0', () => {
    renderCard({ ...BASE_ITEM, percentDiscountPrice: '10.00', isOffer: true });
    expect(screen.getByTestId('product-badge-percent')).toHaveTextContent('-10%');
  });

  it('renders the red -$X.XX badge when discountPrice > 0, in the price\'s currency', () => {
    renderCard({ ...BASE_ITEM, discountPrice: '5.00', isOffer: true });
    expect(screen.getByTestId('product-badge-discount')).toHaveTextContent('-$5.00');
  });

  it('BOTH discount badges appear together when both apply — never collapsed into one', () => {
    const item: PublicProductDto = {
      ...BASE_ITEM,
      isNew: true,
      percentDiscountPrice: '10.00',
      discountPrice: '5.00',
      isOffer: true,
    };
    renderCard(item);

    expect(screen.getByTestId('product-badge-new')).toHaveTextContent('Nuevo');
    expect(screen.getByTestId('product-badge-percent')).toHaveTextContent('-10%');
    expect(screen.getByTestId('product-badge-discount')).toHaveTextContent('-$5.00');
  });

  it('renders an MN price without throwing — the risk formatMoney exists to close', () => {
    const item: PublicProductDto = {
      ...BASE_ITEM,
      finalPrice: { amount: '1234.50', currency: 'MN' },
    };

    expect(() => renderCard(item, 'en-US')).not.toThrow();
    expect(screen.getByText('1,234.50 MN')).toBeInTheDocument();
  });
});
