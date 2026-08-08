import { formatMoney } from '@store-mgmt/storefront/config';
import { InfoPopover } from '../shared/info-popover';
import { DECISIONES_HELP } from './help-content';
import type { GestorRankingView, WindowDays } from '../../domain/decisiones-dashboard';

/** `General` = unfiltered (matches prior, pre-window behavior). */
export type GestorRankingPeriod = WindowDays | 'general';

export interface GestorRankingProps {
  gestores: GestorRankingView;
  /** Currently selected period; the caller owns this state and pre-filters `gestores` via `windowedState`. */
  period: GestorRankingPeriod;
  onPeriodChange: (period: GestorRankingPeriod) => void;
}

const MONEY = { locale: 'en-US', currency: 'USD' } as const;

/**
 * Análisis — "Ranking de gestores": one row per gestor (zero-order gestores
 * still shown), sorted desc by revenue by the domain builder. Revenue/AOV
 * are USD via `formatMoney`; commission figures stay native MN plain text.
 *
 * Carries a `[7d/30d/General]` period selector — a view-only control, same
 * shape as `PeriodFilter`, but with a third "General" option. The caller
 * (route) owns the selected value and is responsible for pre-filtering the
 * `gestores` view model (via `windowedState(state, days)` for 7/30, or the
 * unwindowed `state` for General) before calling `buildGestorRanking`.
 */
export function GestorRanking({ gestores, period, onPeriodChange }: GestorRankingProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-lg font-semibold text-text">Ranking de gestores</h2>
          <InfoPopover {...DECISIONES_HELP.rankingGestores} />
        </div>
        <div className="flex gap-1 text-xs" role="group" aria-label="Filtro de período">
          <button
            type="button"
            aria-pressed={period === 7}
            onClick={() => onPeriodChange(7)}
            className={`rounded px-2 py-1 ${period === 7 ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            7d
          </button>
          <button
            type="button"
            aria-pressed={period === 30}
            onClick={() => onPeriodChange(30)}
            className={`rounded px-2 py-1 ${period === 30 ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            30d
          </button>
          <button
            type="button"
            aria-pressed={period === 'general'}
            onClick={() => onPeriodChange('general')}
            className={`rounded px-2 py-1 ${period === 'general' ? 'bg-primary text-white' : 'text-text-muted'}`}
          >
            General
          </button>
        </div>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Gestor</th>
              <th className="px-2 py-1">Ventas</th>
              <th className="px-2 py-1">Pedidos</th>
              <th className="px-2 py-1">AOV</th>
              <th className="px-2 py-1">Comisión devengada</th>
              <th className="px-2 py-1">Comisión pendiente</th>
            </tr>
          </thead>
          <tbody>
            {gestores.rows.map((row) => (
              <tr key={row.gestorId} className="border-t border-border">
                <td className="px-2 py-1">{row.name}</td>
                <td className="px-2 py-1">{formatMoney(row.revenueUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.count}</td>
                <td className="px-2 py-1">{formatMoney(row.aovUSD, MONEY)}</td>
                <td className="px-2 py-1">{row.commissionEarnedMN} MN</td>
                <td className="px-2 py-1">{row.commissionPendingMN} MN</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
