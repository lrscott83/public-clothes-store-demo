import type { AdminCategoryDto, AdminProductDto } from '../lib/admin-api.types';

const CURRENCIES = ['USD', 'EUR', 'MN'] as const;

export interface ProductFormProps {
  categories: AdminCategoryDto[];
  submitLabel: string;
  error?: string;
  defaultValues?: Partial<AdminProductDto>;
}

/**
 * Shared by `nuevo.tsx` and `editar.tsx` — same fields either way, since
 * `UpdateProductInput` is `Partial<CreateProductInput>`. `image` is a raw
 * ref path (text input), matching `api-salesops`'s current `CreateProductDto`
 * contract — the upload UI that fills it in for the admin lands in task
 * 6.7, not here.
 */
export function ProductForm({ categories, submitLabel, error, defaultValues }: ProductFormProps) {
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
          <span className="text-sm font-medium text-text">Descripción</span>
          <textarea
            name="description"
            required
            defaultValue={defaultValues?.description}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Categoría</span>
          <select
            name="categoryId"
            required
            defaultValue={defaultValues?.categoryId}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          >
            <option value="" disabled>
              Elegí una categoría
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
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
          <span className="text-sm font-medium text-text">Precio</span>
          <div className="flex gap-2">
            <input
              name="priceAmount"
              type="text"
              required
              placeholder="100.00"
              defaultValue={defaultValues?.price?.amount}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-text"
            />
            <select
              name="priceCurrency"
              required
              defaultValue={defaultValues?.price?.currency}
              className="rounded-md border border-border bg-background px-3 py-2 text-text"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Costo</span>
          <div className="flex gap-2">
            <input
              name="costAmount"
              type="text"
              required
              placeholder="50.00"
              defaultValue={defaultValues?.cost?.amount}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-text"
            />
            <select
              name="costCurrency"
              required
              defaultValue={defaultValues?.cost?.currency}
              className="rounded-md border border-border bg-background px-3 py-2 text-text"
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">% de descuento</span>
          <input
            name="percentDiscountPrice"
            type="text"
            placeholder="0.00"
            defaultValue={defaultValues?.percentDiscountPrice}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Descuento fijo</span>
          <input
            name="discountPrice"
            type="text"
            placeholder="0.00"
            defaultValue={defaultValues?.discountPrice}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">SKU</span>
          <input
            name="sku"
            type="text"
            defaultValue={defaultValues?.sku ?? undefined}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">Código de barras</span>
          <input
            name="barcode"
            type="text"
            defaultValue={defaultValues?.barcode ?? undefined}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-text">Imagen (ruta)</span>
          <input
            name="image"
            type="text"
            required
            placeholder="products/remera.jpg"
            defaultValue={defaultValues?.image ?? ''}
            className="rounded-md border border-border bg-background px-3 py-2 text-text"
          />
        </label>

        <label className="flex items-center gap-2 sm:col-span-2">
          <input name="isNew" type="checkbox" defaultChecked={defaultValues?.isNew} />
          <span className="text-sm font-medium text-text">Marcar como nuevo</span>
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
