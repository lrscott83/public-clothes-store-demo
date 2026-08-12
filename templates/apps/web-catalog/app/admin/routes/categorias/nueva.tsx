import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { createCategory } from '../../lib/categories.server';
import { CategoryForm } from '../../components/category-form';
import type { CreateCategoryInput } from '../../lib/admin-api.types';

export function meta() {
  return [{ title: 'Nueva categoría — Admin' }];
}

/** Builds `CreateCategoryInput` from `<CategoryForm>`'s raw `FormData` — shared shape with `editar.tsx`'s update path. */
export function parseCategoryFormData(formData: FormData): CreateCategoryInput {
  const image = String(formData.get('image') ?? '').trim();
  const icon = String(formData.get('icon') ?? '').trim();

  return {
    name: String(formData.get('name') ?? ''),
    slug: String(formData.get('slug') ?? ''),
    order: Number(formData.get('order') ?? 0),
    ...(image && { image }),
    ...(icon && { icon }),
  };
}

export const action = withAuth(async ({ request, companyId }) => {
  const formData = await request.formData();
  const input = parseCategoryFormData(formData);

  try {
    await createCategory(request, companyId, input);
  } catch (err) {
    if (err instanceof Response) {
      return { error: categoryErrorMessage(err.status) };
    }
    throw err;
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
        <Form method="post">
          <CategoryForm error={error} submitLabel="Crear categoría" />
        </Form>
      </div>
    </main>
  );
}

export default function NuevaCategoriaRoute() {
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  return <NuevaCategoriaPage error={actionData?.error} />;
}
