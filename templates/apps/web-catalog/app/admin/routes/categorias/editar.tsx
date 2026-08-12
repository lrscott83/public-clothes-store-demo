import { Form, redirect, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { getCategory, updateCategory, softDeleteCategory } from '../../lib/categories.server';
import { CategoryForm } from '../../components/category-form';
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
 * One route, two mutations, distinguished by a hidden `intent` field — same
 * `withAuth`-resolved `companyId` either way, so a soft-delete can never
 * apply to a DIFFERENT company than an edit would (design D7's
 * cross-company re-verification: `api-salesops`'s `TenantContextGuard`
 * still independently checks the caller's membership in `companyId` on
 * every request, this is not the only gate). Delete is always a soft
 * delete server-side (`active=false`) — this action never issues anything
 * but a DELETE request, api-salesops owns the soft-vs-hard distinction.
 */
export const action = withAuth(async ({ request, params, companyId }) => {
  const id = params.id!;
  const formData = await request.formData();
  const intent = formData.get('intent');

  try {
    if (intent === 'delete') {
      await softDeleteCategory(request, companyId, id);
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
          <CategoryForm error={error} submitLabel="Guardar cambios" defaultValues={category} />
        </Form>

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
