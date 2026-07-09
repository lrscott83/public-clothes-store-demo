import type { SeedState } from './types';

export interface ProfitabilityRow {
  orderId: string;
  label: string; // client.name
  revenueUSD: number;
  costUSD: number;
  commissionUSD: number;
  marginUSD: number;
  marginPercent: number;
  isLoss: boolean;
}

export interface ProfitabilityTotals {
  revenueUSD: number;
  costUSD: number;
  commissionUSD: number;
  marginUSD: number;
}

export interface ProfitabilityView {
  rows: ProfitabilityRow[];
  totals: ProfitabilityTotals;
  count: number;
}

/**
 * Pure aggregation: builds a profitability ranking view model from
 * `SeedState`, one `ProfitabilityRow` per order with `state !== 'creado'`
 * (a `creado` order has no frozen totals and is excluded entirely — not
 * even a placeholder row). No I/O, no formatting/locale — that happens
 * only at the leaf render.
 *
 * `commissionUSD` is derived ONLY from the order's OWN frozen
 * `exchangeRateSnapshot.usdToMn` — never the live `state.exchangeRates` —
 * so a later live-rate edit never changes an already-ranked order's
 * commission or margin. Orphan `productId` references (no matching
 * product) are skipped without throwing, contributing 0 to `costUSD`.
 */
export function buildProfitabilityRanking(state: SeedState): ProfitabilityView {
  const productById = new Map(state.products.map((product) => [product.id, product]));

  const rows: ProfitabilityRow[] = state.orders
    .filter((order) => order.state !== 'creado')
    .map((order) => {
      const revenueUSD = order.totalUSD;

      let costUSD = 0;
      for (const item of order.items) {
        const product = productById.get(item.productId);
        if (!product) continue; // orphan skip — no matching product
        costUSD += item.quantity * product.costUSD;
      }

      const usdToMn = order.exchangeRateSnapshot?.usdToMn ?? 0;
      const commissionMN = order.commissionMN ?? 0;
      const commissionUSD = usdToMn > 0 ? commissionMN / usdToMn : 0;

      const marginUSD = revenueUSD - costUSD - commissionUSD;
      const marginPercent = revenueUSD > 0 ? (marginUSD / revenueUSD) * 100 : 0;

      return {
        orderId: order.id,
        label: order.client.name,
        revenueUSD,
        costUSD,
        commissionUSD,
        marginUSD,
        marginPercent,
        isLoss: marginUSD < 0,
      };
    });

  rows.sort((a, b) => b.marginUSD - a.marginUSD || a.orderId.localeCompare(b.orderId));

  const totals: ProfitabilityTotals = rows.reduce(
    (acc, row) => ({
      revenueUSD: acc.revenueUSD + row.revenueUSD,
      costUSD: acc.costUSD + row.costUSD,
      commissionUSD: acc.commissionUSD + row.commissionUSD,
      marginUSD: acc.marginUSD + row.marginUSD,
    }),
    { revenueUSD: 0, costUSD: 0, commissionUSD: 0, marginUSD: 0 },
  );

  return { rows, totals, count: rows.length };
}
