import { Link } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { listCategories } from '../../lib/categories.server';
import type { AdminCategoryDto } from '../../lib/admin-api.types';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Categorías — Admin' }];
}

export const loader = withAuth(async ({ request, companyId }) => {
  const categories = await listCategories(request, companyId);
  return { categories };
});

export interface CategoriasAdminPageProps {
  categories: AdminCategoryDto[];
}

export function CategoriasAdminPage({ categories }: CategoriasAdminPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Categorías</h1>
          <Link
            to="/admin/categorias/nueva"
            className="rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
          >
            Nueva categoría
          </Link>
        </div>

        {categories.length === 0 ? (
          <p className="text-text-muted">No hay categorías todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-sm text-text-muted">
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Slug</th>
                  <th className="py-2 pr-4">Orden</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b border-border">
                    <td className="py-2 pr-4 text-text">{category.name}</td>
                    <td className="py-2 pr-4 text-text-muted">{category.slug}</td>
                    <td className="py-2 pr-4 text-text-muted">{category.order}</td>
                    <td className="py-2 pr-4">
                      <span
                        data-testid={`category-status-${category.id}`}
                        className={category.active ? 'text-green-600' : 'text-text-muted'}
                      >
                        {category.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/admin/categorias/${category.id}/editar`}
                        className="text-sm font-medium text-primary hover:text-primary-hover"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function CategoriasAdminRoute({ loaderData }: Route.ComponentProps) {
  return <CategoriasAdminPage categories={loaderData.categories} />;
}
