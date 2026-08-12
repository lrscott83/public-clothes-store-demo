import type { AdminCategoryDto } from '../lib/admin-api.types';

export interface CategoryFormProps {
  submitLabel: string;
  error?: string;
  defaultValues?: Partial<AdminCategoryDto>;
}

/**
 * Shared by `nueva.tsx` and `editar.tsx` — same fields either way, since
 * `UpdateCategoryInput` is `Partial<CreateCategoryInput>`. `image`/`icon`
 * are raw ref paths (text inputs), matching `api-salesops`'s current
 * `CreateCategoryDto` contract — no upload UI for categories (task 6.7
 * only covers the product image endpoint).
 */
export function CategoryForm({ submitLabel, error, defaultValues }: CategoryFormProps) {
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

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-text">Imagen (ruta, opcional)</span>
          <input
            name="image"
            type="text"
            placeholder="categories/remeras.jpg"
            defaultValue={defaultValues?.image ?? undefined}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>
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
