import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import {
  getCategory,
  updateCategory,
  softDeleteCategory,
  uploadCategoryImage,
  deleteCategoryImage,
} from '../../lib/categories.server';
import { CategoryForm } from '../../components/category-form';
import { ProductImage } from '../../../shared/components/image-placeholder';
import { parseCategoryFormData, categoryErrorMessage } from './nueva';
import type { AdminCategoryDto } from '../../lib/admin-api.types';
import type { Route } from './+types/editar';

export function meta() {
  return [{ title: 'Editar categoría — Admin' }];
}

export const loader = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const category = await getCategory(request, companyId, id);
  return { category };
});

/**
 * One route, four mutations, distinguished by a hidden `intent` field —
 * same `withAuth`-resolved `companyId` every time, so none of them can ever
 * apply to a DIFFERENT company than the page was loaded for (design D7's
 * cross-company re-verification: `api-salesops`'s `TenantContextGuard`
 * still independently checks the caller's membership in `companyId` on
 * every request, this is not the only gate). Delete is always a soft
 * delete server-side (`active=false`) — this action never issues anything
 * but a DELETE request, api-salesops owns the soft-vs-hard distinction.
 *
 * `upload-image` and `remove-image` both redirect back to THIS SAME edit
 * route, not the list — the done-criterion is that the mutation's result is
 * visible to the admin who just performed it, so the loader must re-run and
 * re-fetch the category's now-updated `image` ref.
 *
 * The default (field-edit) branch calls `parseCategoryFormData`, which
 * never reads an `image` field off the submitted form — so an `image`
 * value an attacker slips into a regular edit submission can never reach
 * `updateCategory`'s payload and silently hijack or revert the photo; only
 * `upload-image`/`remove-image` can ever change it.
 */
export const action = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'delete') {
      await softDeleteCategory(request, companyId, id);
    } else if (intent === 'upload-image') {
      const image = formData.get('image');
      const uploadFormData = new FormData();
      uploadFormData.set('image', image as Blob);
      await uploadCategoryImage(request, companyId, id, uploadFormData);
      return redirect(`/admin/categorias/${id}/editar`);
    } else if (intent === 'remove-image') {
      await deleteCategoryImage(request, companyId, id);
      return redirect(`/admin/categorias/${id}/editar`);
    } else {
      await updateCategory(request, companyId, id, parseCategoryFormData(formData));
    }
  } catch (err) {
    if (err instanceof Response) {
      return { error: categoryErrorMessage(err.status) };
    }
    throw err;
  }

  return redirect('/admin/categorias');
});

export interface EditarCategoriaPageProps {
  category: AdminCategoryDto;
  error?: string;
}

export function EditarCategoriaPage({ category, error }: EditarCategoriaPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-6">Editar categoría</h1>

        <Form method="post" className="mb-4">
          <CategoryForm mode="edit" error={error} submitLabel="Guardar cambios" defaultValues={category} />
        </Form>

        <div className="mb-4 bg-surface border border-border rounded-lg p-6">
          <span className="text-sm font-medium text-text">Imagen de la categoría</span>

          <ProductImage
            src={category.image === null ? null : `/admin/categorias/${category.id}/image`}
            alt={category.name}
            className="mt-3 h-40 w-40 rounded-md border border-border object-cover"
          />

          <Form method="post" encType="multipart/form-data" className="mt-4">
            <input type="hidden" name="intent" value="upload-image" />
            <input name="image" type="file" accept="image/*" required className="text-sm text-text" />
            <button
              type="submit"
              className="mt-3 block rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
            >
              {category.image === null ? 'Subir imagen' : 'Reemplazar imagen'}
            </button>
          </Form>

          {category.image !== null && (
            <Form
              method="post"
              className="mt-3"
              onSubmit={(event) => {
                if (!confirm('¿Quitar la imagen? El archivo se elimina y no se puede recuperar.')) {
                  event.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="remove-image" />
              <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-700">
                Quitar imagen
              </button>
            </Form>
          )}
        </div>

        <Form
          method="post"
          onSubmit={(event) => {
            if (
              !confirm('¿Eliminar esta categoría? Podés seguir viéndola en la lista, pero dejará de ofrecerse.')
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="intent" value="delete" />
          <button type="submit" className="text-sm font-medium text-red-600 hover:text-red-700">
            Eliminar categoría
          </button>
        </Form>
      </div>
    </main>
  );
}

export default function EditarCategoriaRoute({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return <EditarCategoriaPage category={loaderData.category} error={actionData?.error} />;
}
