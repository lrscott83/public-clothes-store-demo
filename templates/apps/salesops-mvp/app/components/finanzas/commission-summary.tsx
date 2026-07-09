import type { FinanceKpis } from '../../domain/finanzas';

export interface CommissionSummaryProps {
  kpis: FinanceKpis;
}

/**
 * KPI block for the commission cash-flow summary ("Resumen de comisiones").
 * Every commission figure is native MN and renders as plain `{value} MN`
 * text — NEVER `formatMoney` (MN is not ISO currency; see
 * `order-card.tsx:26` precedent). Heading text deliberately avoids the word
 * "finanzas" so `routes.test.tsx`'s `getByRole('heading', { name:
 * /finanzas/i })` stays unambiguous.
 */
export function CommissionSummary({ kpis }: CommissionSummaryProps) {
  return (
    <section className="mt-4">
      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold text-text">Resumen de comisiones</h2>
        <dl className="mt-2 flex flex-wrap gap-6">
          <div>
            <dt className="text-sm text-text-muted">Comisión pagada</dt>
            <dd className="text-lg font-bold text-text">{kpis.commissionPaidMN} MN</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Comisión pendiente</dt>
            <dd className="text-lg font-bold text-text">{kpis.commissionPendingMN} MN</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Comisión total</dt>
            <dd className="text-lg font-bold text-text">{kpis.commissionTotalMN} MN</dd>
          </div>
          <div>
            <dt className="text-sm text-text-muted">Pendientes de pago</dt>
            <dd className="text-lg font-bold text-text">{kpis.pendingPaymentCount}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
