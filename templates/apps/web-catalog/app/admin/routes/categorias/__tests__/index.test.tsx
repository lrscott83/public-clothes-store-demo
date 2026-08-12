import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { CategoriasAdminPage } from '../index';
import type { AdminCategoryDto } from '../../../lib/admin-api.types';

const CATEGORY: AdminCategoryDto = {
  id: 'cat-1',
  name: 'Remeras',
  slug: 'remeras',
  image: null,
  icon: null,
  order: 1,
  active: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderPage(categories: AdminCategoryDto[]) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <CategoriasAdminPage categories={categories} /> },
  ]);
  return render(<Stub />);
}

describe('CategoriasAdminPage', () => {
  it('renders the empty state when there are no categories', () => {
    renderPage([]);
    expect(screen.getByText('No hay categorías todavía.')).toBeInTheDocument();
  });

  it('renders a row per category with its slug and active/inactive status', () => {
    renderPage([CATEGORY]);

    expect(screen.getByText('Remeras')).toBeInTheDocument();
    expect(screen.getByText('remeras')).toBeInTheDocument();
    expect(screen.getByTestId('category-status-cat-1')).toHaveTextContent('Inactivo');
  });
});
