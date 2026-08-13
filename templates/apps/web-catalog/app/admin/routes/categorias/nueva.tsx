import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { createCategory, uploadCategoryImage } from '../../lib/categories.server';
import { CategoryForm } from '../../components/category-form';
import type { AdminCategoryDto, CreateCategoryInput } from '../../lib/admin-api.types';

export function meta() {
  return [{ title: 'Nueva categoría — Admin' }];
}

/** Builds `CreateCategoryInput` from `<CategoryForm>`'s raw `FormData` — shared shape with `editar.tsx`'s update path. */
export function parseCategoryFormData(formData: FormData): CreateCategoryInput {
  const icon = String(formData.get('icon') ?? '').trim();

  return {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    order: Number(formData.get('order') ?? 0),
    ...(icon && { icon }),
  };
}

export const action = withAuth(async ({ request, companyId }) => {
  const formData = await request.formData();
  const input = parseCategoryFormData(formData);

  let created: AdminCategoryDto;
  try {
    created = await createCategory(request, companyId, input);
  } catch (err) {
    if (err instanceof Response) {
      return { error: categoryErrorMessage(err.status) };
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
      await uploadCategoryImage(request, companyId, created.id, uploadFormData);
    } catch {
      return {
        error: 'La categoría se creó, pero la imagen no se pudo subir. Podés subirla desde la edición.',
      };
    }
  }

  return redirect('/admin/categorias');
});

/** Shared with `editar.tsx` — the same `api-salesops` guard chain produces the same statuses for the same reasons. */
export function categoryErrorMessage(status: number): string {
  if (status === 403) {
    return 'No tenés permiso para hacer esta operación en esta tienda.';
  }
  if (status === 400) {
    return 'Revisá los datos del formulario.';
  }
  return 'No se pudo guardar la categoría. Intentá de nuevo.';
}

export interface NuevaCategoriaPageProps {
  error?: string;
}

export function NuevaCategoriaPage({ error }: NuevaCategoriaPageProps = {}) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-text mb-6">Nueva categoría</h1>
        <Form method="post" encType="multipart/form-data">
          <CategoryForm mode="create" error={error} submitLabel="Crear categoría" />
        </Form>
      </div>
    </main>
  );
}

export default function NuevaCategoriaRoute() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return <NuevaCategoriaPage error={actionData?.error} />;
}
