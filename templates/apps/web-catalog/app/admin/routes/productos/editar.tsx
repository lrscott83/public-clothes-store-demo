import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { getProduct, updateProduct, softDeleteProduct } from '../../lib/products.server';
import { listCategories } from '../../lib/categories.server';
import { ProductForm } from '../../components/product-form';
import { parseProductFormData, productErrorMessage } from './nuevo';
import type { AdminCategoryDto, AdminProductDto } from '../../lib/admin-api.types';
import type { Route } from './+types/editar';

export function meta() {
  return [{ title: 'Editar producto — Admin' }];
}

export const loader = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const [product, categories] = await Promise.all([
    getProduct(request, companyId, id),
    listCategories(request, companyId),
  ]);
  return { product, categories };
});

/**
 * One route, two mutations, distinguished by a hidden `intent` field — same
 * `withAuth`-resolved `companyId` either way, so a soft-delete can never
 * apply to a DIFFERENT company than an edit would (design D7's
 * cross-company re-verification: `api-salesops`'s `TenantContextGuard`
 * still independently checks the caller's membership in `companyId` on
 * every request, this is not the only gate).
 */
export const action = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'delete') {
      await softDeleteProduct(request, companyId, id);
    } else {
      await updateProduct(request, companyId, id, parseProductFormData(formData));
    }
  } catch (err) {
    if (err instanceof Response) {
      return { error: productErrorMessage(err.status) };
    }
    throw err;
  }

  return redirect('/admin/productos');
});

export interface EditarProductoPageProps {
  product: AdminProductDto;
  categories: AdminCategoryDto[];
  error?: string;
}

export function EditarProductoPage({ product, categories, error }: EditarProductoPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-6">Editar producto</h1>

        <Form method="post" className="mb-4">
          <ProductForm categories={categories} error={error} submitLabel="Guardar cambios" defaultValues={product} />
        </Form>

        <Form
          method="post"
          onSubmit={(event) => {
            if (!confirm('¿Eliminar este producto? Podés seguir viéndolo en la lista, pero dejará de ofrecerse.')) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-700">
            Eliminar producto
          </button>
        </Form>
      </div>
    </main>
  );
}

export default function EditarProductoRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return (
    <EditarProductoPage
      product={loaderData.product}
      categories={loaderData.categories}
      error={actionData?.error}
    />
  );
}
