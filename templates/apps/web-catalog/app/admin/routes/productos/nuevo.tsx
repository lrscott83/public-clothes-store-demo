import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { createProduct, uploadProductImage } from '../../lib/products.server';
import { listCategories } from '../../lib/categories.server';
import { ProductForm } from '../../components/product-form';
import type { AdminCategoryDto, AdminProductDto } from '../../lib/admin-api.types';
import type { CreateProductInput } from '../../lib/admin-api.types';
import type { Route } from './+types/nuevo';

export function meta() {
  return [{ title: 'Nuevo producto — Admin' }];
}

export const loader = withAuth(async ({ request, companyId }) => {
  const categories = await listCategories(request, companyId);
  return { categories };
});

/** Builds `CreateProductInput` from `<ProductForm>`'s raw `FormData` — shared shape with `editar.tsx`'s update path. */
export function parseProductFormData(formData: FormData): CreateProductInput {
  const percentDiscountPrice = String(formData.get('percentDiscountPrice') ?? '').trim();
  const discountPrice = String(formData.get('discountPrice') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim();
  const barcode = String(formData.get('barcode') ?? '').trim();

  return {
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    categoryId: String(formData.get('categoryId') ?? ''),
    order: Number(formData.get('order') ?? 0),
    price: {
      amount: String(formData.get('priceAmount') ?? ''),
      currency: String(formData.get('priceCurrency') ?? ''),
    },
    cost: {
      amount: String(formData.get('costAmount') ?? ''),
      currency: String(formData.get('costCurrency') ?? ''),
    },
    isNew: formData.get('isNew') === 'on',
    ...(sku && { sku }),
    ...(barcode && { barcode }),
    ...(percentDiscountPrice && { percentDiscountPrice }),
    ...(discountPrice && { discountPrice }),
  };
}

export const action = withAuth(async ({ request, companyId }) => {
  const formData = await request.formData();
  const input = parseProductFormData(formData);

  let created: AdminProductDto;
  try {
    created = await createProduct(request, companyId, input);
  } catch (err) {
    if (err instanceof Response) {
      return { error: productErrorMessage(err.status) };
    }
    throw err;
  }

  // design.md D6 — create first, then upload against the id we just got. If the
  // upload fails the row still exists WITHOUT an image, which is a legal state
  // since admin-image-crud; we say so instead of pretending the create failed.
  const file = formData.get('imageFile');
  if (file instanceof File && file.size > 0) {
    const uploadFormData = new FormData();
    uploadFormData.set('image', file);
    try {
      await uploadProductImage(request, companyId, created.id, uploadFormData);
    } catch {
      return {
        error: 'El producto se creó, pero la imagen no se pudo subir. Podés subirla desde la edición.',
      };
    }
  }

  return redirect('/admin/productos');
});

/** Shared with `editar.tsx` — the same `api-salesops` guard chain produces the same statuses for the same reasons. */
export function productErrorMessage(status: number): string {
  if (status === 403) {
    return 'No tenés permiso para hacer esta operación en esta tienda.';
  }
  if (status === 400) {
    return 'Revisá los datos del formulario.';
  }
  return 'No se pudo guardar el producto. Intentá de nuevo.';
}

export interface NuevoProductoPageProps {
  categories: AdminCategoryDto[];
  error?: string;
}

export function NuevoProductoPage({ categories, error }: NuevoProductoPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-6">Nuevo producto</h1>
        <Form method="post" encType="multipart/form-data">
          <ProductForm mode="create" categories={categories} error={error} submitLabel="Crear producto" />
        </Form>
      </div>
    </main>
  );
}

export default function NuevoProductoRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return <NuevoProductoPage categories={loaderData.categories} error={actionData?.error} />;
}
