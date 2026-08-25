import { Form, useActionData } from 'react-router';
import { withAuth } from '../../../shared/lib/auth.guards.server';
import { importProducts } from '../../lib/products.server';
import type { AdminImportReport } from '../../lib/admin-api.types';
import type { Route } from './+types/importar';

export function meta() {
  return [{ title: 'Importar productos — Admin' }];
}

export const loader = withAuth(async () => {
  return {};
});

export const action = withAuth(async ({ request, companyId }) => {
  const formData = await request.formData();
  const file = formData.get('csvFile');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Adjuntá un archivo CSV.' };
  }

  const upstream = new FormData();
  upstream.set('csv', file);

  try {
    const report = await importProducts(request, companyId, upstream);
    return { report };
  } catch (err) {
    if (err instanceof Response) {
      return { error: importErrorMessage(err.status) };
    }
    throw err;
  }
});

/** Shared shape with the admin CRUD routes — the same `api-salesops` guard chain produces the same statuses. */
export function importErrorMessage(status: number): string {
  if (status === 400) {
    return 'El archivo fue rechazado: revisá el encabezado del CSV y que no supere las 1000 filas.';
  }
  if (status === 403) {
    return 'No tenés permiso para hacer esta operación en esta tienda.';
  }
  if (status === 413) {
    return 'El archivo supera el límite de 5 MB. Subí un CSV más chico.';
  }
  return 'No se pudo importar el archivo. Intentá de nuevo.';
}

const STATUS_LABELS = {
  created: 'Creada',
  updated: 'Actualizada',
  failed: 'Fallida',
} as const;

export interface ImportarProductosPageProps {
  report?: AdminImportReport;
  error?: string;
}

export function ImportarProductosPage({ report, error }: ImportarProductosPageProps) {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="container mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-text mb-6">Importar productos</h1>

        <Form method="post" encType="multipart/form-data" className="mb-8">
          <label htmlFor="csvFile" className="block text-sm font-medium text-text mb-2">
            Subí tu archivo CSV
          </label>
          <input
            id="csvFile"
            name="csvFile"
            type="file"
            accept=".csv"
            required
            className="block w-full text-text border border-border rounded-md px-3 py-2 mb-4 bg-surface"
          />
          {error && (
            <p role="alert" className="text-red-600 text-sm mb-4">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="rounded-md bg-primary text-white font-medium px-4 py-2 hover:bg-primary-hover transition-colors"
          >
            Importar
          </button>
        </Form>

        {report && (
          <section aria-label="Resultado de la importación">
            <div className="flex gap-6 mb-4 text-sm">
              <span>
                Filas procesadas:{' '}
                <strong data-testid="report-total-filas">{report.totalRows}</strong>
              </span>
              <span data-testid="report-total-creadas">
                Creadas: <strong>{report.created}</strong>
              </span>
              <span data-testid="report-total-actualizadas">
                Actualizadas: <strong>{report.updated}</strong>
              </span>
              <span data-testid="report-total-fallidas">
                Fallidas: <strong>{report.failed}</strong>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-sm text-text-muted">
                    <th className="py-2 pr-4">Línea</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.line} className="border-b border-border">
                      <td className="py-2 pr-4 text-text-muted">{row.line}</td>
                      <td className={`py-2 pr-4 ${row.status === 'failed' ? 'text-red-600' : 'text-green-600'}`}>
                        {STATUS_LABELS[row.status]}
                      </td>
                      <td className="py-2 pr-4 text-text">{row.name ?? '—'}</td>
                      <td className="py-2 pr-4 text-text-muted">{row.reason ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function ImportarProductosRoute({ loaderData, actionData }: Route.ComponentProps) {
  const result = actionData as { report?: AdminImportReport; error?: string } | undefined;
  void loaderData;
  return <ImportarProductosPage report={result?.report} error={result?.error} />;
}
