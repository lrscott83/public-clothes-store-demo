import type { AdminCategoryDto } from '../lib/admin-api.types';

export interface CategoryFormProps {
  /** `create` shows the file picker; `edit` has its own upload form beside this one. */
  mode: 'create' | 'edit';
  submitLabel: string;
  error?: string;
  defaultValues?: Partial<AdminCategoryDto>;
}

/**
 * Shared by `nueva.tsx` and `editar.tsx` — same fields either way, since
 * `UpdateCategoryInput` is `Partial<CreateCategoryInput>`. `icon` stays a
 * genuinely free-text field (design.md §1, out of scope) — it is never an
 * image. `image` is never a field of this form: in `create` mode the admin
 * picks a file, uploaded via `uploadCategoryImage` right after the category
 * row is created; in `edit` mode there is no image control here at all —
 * `editar.tsx` owns its own upload/replace/remove UI beside this form.
 */
export function CategoryForm({ mode, submitLabel, error, defaultValues }: CategoryFormProps) {
  return (
    <div className="bg-surface border border-border rounded-lg p-8 shadow-card">
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-text">Nombre</span>
          <input
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-text">Slug</span>
          <input
            name="slug"
            type="text"
            required
            defaultValue={defaultValues?.slug}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Orden</span>
          <input
            name="order"
            type="number"
            required
            defaultValue={defaultValues?.order}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Ícono (opcional)</span>
          <input
            name="icon"
            type="text"
            defaultValue={defaultValues?.icon ?? undefined}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        {mode === 'create' && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-text">Imagen (opcional)</span>
            <input name="imageFile" type="file" accept="image/*" className="text-sm text-text" />
          </label>
        )}
      </div>

      <button
        type="submit"
        className="mt-6 rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
}
