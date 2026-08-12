import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { getProduct, updateProduct, softDeleteProduct, uploadProductImage } from '../../lib/products.server';
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
 * One route, three mutations, distinguished by a hidden `intent` field —
 * same `withAuth`-resolved `companyId` every time, so none of them can ever
 * apply to a DIFFERENT company than the page was loaded for (design D7's
 * cross-company re-verification: `api-salesops`'s `TenantContextGuard`
 * still independently checks the caller's membership in `companyId` on
 * every request, this is not the only gate).
 *
 * `upload-image` (task 6.7) redirects back to THIS SAME edit route, not the
 * list — the done-criterion is that the upload's result is visible to the
 * admin who just performed it, so the loader must re-run and re-fetch the
 * product's now-updated `image` ref.
 */
export const action = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'delete') {
      await softDeleteProduct(request, companyId, id);
    } else if (intent === 'upload-image') {
      const image = formData.get('image');
      const uploadFormData = new FormData();
      uploadFormData.set('image', image as Blob);
      await uploadProductImage(request, companyId, id, uploadFormData);
      return redirect(`/admin/productos/${id}/editar`);
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

        <Form method="post" encType="multipart/form-data" className="mb-4 bg-surface border border-border rounded-lg p-6">
          <input type="hidden" name="intent" value="upload-image" />
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">Imagen del producto</span>
            <span className="text-xs text-text-muted">Imagen actual: {product.image}</span>
            <input
              name="image"
              type="file"
              accept="image/*"
              required
              className="text-sm text-text"
            />
          </label>
          <button
            type="submit"
            className="mt-4 rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
          >
            Subir imagen
          </button>
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
