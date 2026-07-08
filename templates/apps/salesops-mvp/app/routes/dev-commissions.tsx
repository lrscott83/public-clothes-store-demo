import { buildCommissionReviewTable } from '../seed/review-table';
import { loadSeedState } from '../store/seed-store';

export function meta() {
  return [{ title: 'Dev — Commission review' }];
}

/**
 * Dev-only route: renders the full product -> commissionMN review table
 * in-browser (mirrors the committed `app/seed/__snapshots__/commission-table.md`
 * artifact) so fallback assignments (⚠) can be eyeballed live against the
 * running demo dataset. Not linked from the sidebar — visit `/dev-commissions`
 * directly.
 */
export default function DevCommissions() {
  const { products } = loadSeedState();
  const rows = buildCommissionReviewTable(products);
  const fallbackCount = rows.filter((row) => row.isFallback).length;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Revisión de comisiones</h1>
      <p className="mt-2 text-sm text-text-muted">
        {rows.length} productos · {fallbackCount} marcados ⚠ (comisión por categoría o catch-all —
        requieren revisión humana).
      </p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b p-2 text-left">id</th>
            <th className="border-b p-2 text-left">name</th>
            <th className="border-b p-2 text-left">category</th>
            <th className="border-b p-2 text-right">price</th>
            <th className="border-b p-2 text-right">costUSD</th>
            <th className="border-b p-2 text-right">commissionMN</th>
            <th className="border-b p-2 text-left">rule</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="border-b p-2">{row.id}</td>
              <td className="border-b p-2">
                {row.name}
                {row.isFallback ? <span aria-hidden="true"> ⚠</span> : null}
              </td>
              <td className="border-b p-2">{row.category}</td>
              <td className="border-b p-2 text-right">{row.price}</td>
              <td className="border-b p-2 text-right">{row.costUSD}</td>
              <td className="border-b p-2 text-right">{row.commissionMN}</td>
              <td className="border-b p-2">{row.rule}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
