import { Link } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { ProductImage } from '../../../shared/components/image-placeholder';
import { listProducts } from '../../lib/products.server';
import { listCategories } from '../../lib/categories.server';
import type { AdminCategoryDto, AdminProductDto } from '../../lib/admin-api.types';
import type { Route } from './+types/index';

export function meta() {
  return [{ title: 'Productos — Admin' }];
}

export const loader = withAuth(async ({ request, companyId }) => {
  const [products, categories] = await Promise.all([
    listProducts(request, companyId),
    listCategories(request, companyId),
  ]);
  return { products, categories };
});

export interface ProductosAdminPageProps {
  products: AdminProductDto[];
  categories: AdminCategoryDto[];
}

export function ProductosAdminPage({ products, categories }: ProductosAdminPageProps) {
  const categoryName = (categoryId: string) =>
    categories.find((category) => category.id === categoryId)?.name ?? categoryId;

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text">Productos</h1>
          <Link
            to="/admin/productos/nuevo"
            className="rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
          >
            Nuevo producto
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="text-text-muted">No hay productos todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-sm text-text-muted">
                  <th className="py-2 pr-4 w-16" />
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Categoría</th>
                  <th className="py-2 pr-4">Precio</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <ProductImage
                        src={product.image === null ? null : `/admin/productos/${product.id}/image`}
                        alt={product.name}
                        className="h-12 w-12 rounded border border-border object-cover"
                      />
                    </td>
                    <td className="py-2 pr-4 text-text">{product.name}</td>
                    <td className="py-2 pr-4 text-text-muted">{categoryName(product.categoryId)}</td>
                    <td className="py-2 pr-4 text-text-muted">
                      {product.price.currency} {product.price.amount}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        data-testid={`product-status-${product.id}`}
                        className={product.active ? 'text-green-600' : 'text-text-muted'}
                      >
                        {product.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Link
                        to={`/admin/productos/${product.id}/editar`}
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

export default function ProductosAdminRoute({ loaderData }: Route.ComponentProps) {
  return <ProductosAdminPage products={loaderData.products} categories={loaderData.categories} />;
}
