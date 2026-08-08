import type { Order, OrderState, SeedState } from './types';

export interface FinanceKpis {
  commissionPaidMN: number; // Σ commissionMN where paid
  commissionPendingMN: number; // Σ commissionMN where pending (owed, not yet paid)
  commissionTotalMN: number; // paid + pending
  pendingPaymentCount: number; // count of pending orders
}

export interface FinanceStateRow {
  state: OrderState; // React key + identity
  label: string; // STATE_LABELS[state] (display)
  count: number; // orders in this state
  revenueUSD: number; // Σ totalUSD (always present, incl. creado)
  commissionMN: number; // Σ (commissionMN ?? 0) — 0 for creado
}

export interface FinanceView {
  kpis: FinanceKpis;
  rows: FinanceStateRow[]; // one per OrderState, fixed order creado → … → comision_pagada
}

// Record keys are exhaustiveness-checked: if `OrderState` grows, this fails to
// compile until the new state gets a label (mirrors kanban-board's COLUMN_TITLES).
const STATE_LABELS: Record<OrderState, string> = {
  creado: 'Creado',
  verificado: 'Verificado',
  transportando: 'Transportando',
  entregado: 'Entregado',
  comision_pagada: 'Comisión pagada',
};

const COLUMN_ORDER: OrderState[] = [
  'creado',
  'verificado',
  'transportando',
  'entregado',
  'comision_pagada',
];

const PENDING_STATES: OrderState[] = ['verificado', 'transportando', 'entregado'];

function commOf(order: Order): number {
  return order.commissionMN ?? 0; // coalesce → never NaN (creado is undefined)
}

function isPaid(order: Order): boolean {
  return order.state === 'comision_pagada' || order.commissionPaidAt != null;
}

function isPending(order: Order): boolean {
  return !isPaid(order) && PENDING_STATES.includes(order.state);
}

/**
 * Pure commission & cash-flow view model. Splits commission MN into paid vs
 * pending, counts pending-payment orders, and emits one row per OrderState
 * (revenue USD + commission MN) by iterating the exhaustive label map — never
 * the order list — so all 5 rows are present in fixed order. `commissionMN ?? 0`
 * guards NaN for un-verified orders. No formatting, no conversion — leaves only.
 */
export function buildFinanceSummary(state: SeedState): FinanceView {
  let commissionPaidMN = 0;
  let commissionPendingMN = 0;
  let pendingPaymentCount = 0;

  for (const order of state.orders) {
    if (isPaid(order)) {
      commissionPaidMN += commOf(order);
    } else if (isPending(order)) {
      commissionPendingMN += commOf(order);
      pendingPaymentCount += 1;
    }
  }

  const rows: FinanceStateRow[] = COLUMN_ORDER.map((columnState) => {
    const bucket = state.orders.filter((order) => order.state === columnState);
    return {
      state: columnState,
      label: STATE_LABELS[columnState],
      count: bucket.length,
      revenueUSD: bucket.reduce((sum, order) => sum + order.totalUSD, 0),
      commissionMN: bucket.reduce((sum, order) => sum + commOf(order), 0),
    };
  });

  return {
    kpis: {
      commissionPaidMN,
      commissionPendingMN,
      commissionTotalMN: commissionPaidMN + commissionPendingMN,
      pendingPaymentCount,
    },
    rows,
  };
}
