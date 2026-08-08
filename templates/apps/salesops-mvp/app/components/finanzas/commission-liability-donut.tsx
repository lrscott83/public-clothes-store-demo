import { DonutChart } from '../charts/donut-chart';
import { InfoPopover } from '../shared/info-popover';
import { FINANZAS_HELP } from './help-content';
import type { CommissionLiabilityView } from '../../domain/finanzas-dashboard';

export interface CommissionLiabilityDonutProps {
  commissionLiability: CommissionLiabilityView;
}

/**
 * Layer 2b — "Comisión pagada vs pendiente": 2 donut slices from
 * `buildFinanceSummary.kpis` (paid vs pending MN). Legend labels stay
 * plain Spanish so the caveat that "pagada" refers to gestor commission,
 * not client cash, is never confused with a client "cobrado" event.
 */
export function CommissionLiabilityDonut({ commissionLiability }: CommissionLiabilityDonutProps) {
  const slices = [
    { label: 'Pagada', value: commissionLiability.paidMN },
    { label: 'Pendiente', value: commissionLiability.pendingMN },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold text-text">Comisión pagada vs pendiente</h2>
        <InfoPopover {...FINANZAS_HELP.comisionPagadaPendiente} />
      </div>
      <div className="mt-2">
        <DonutChart slices={slices} ariaLabel="Comisión pagada vs pendiente (MN)" />
      </div>
    </div>
  );
}
