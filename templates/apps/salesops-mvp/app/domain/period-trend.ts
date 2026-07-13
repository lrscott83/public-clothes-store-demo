import { DAY_MS } from '../seed/constants';
import type { Order, SeedState } from './types';

/**
 * Neutral, domain-agnostic period/trend math shared by every dashboard.
 * Carries ZERO business meaning — pure window bucketing on `Order[]` plus
 * ratio math on plain numbers. Both `decisiones-dashboard.ts` and
 * `finanzas-dashboard.ts` depend on this module; it never depends on either
 * of them (no cross-dashboard coupling).
 */

export type Trend = 'up' | 'down' | 'flat';

export interface KpiTrend {
  current: number;
  prior: number;
  /** (current - prior) / prior; `null` when prior is 0 (leaf renders "—"). */
  delta: number | null;
  trend: Trend;
}

export function computeTrend(current: number, prior: number): Trend {
  if (prior === 0) return current > 0 ? 'up' : 'flat';
  if (current > prior) return 'up';
  if (current < prior) return 'down';
  return 'flat';
}

export function computeDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return (current - prior) / prior;
}

export function buildKpiTrend(current: number, prior: number): KpiTrend {
  return { current, prior, delta: computeDelta(current, prior), trend: computeTrend(current, prior) };
}

export interface PeriodSplit {
  current: Order[];
  prior: Order[];
}

/**
 * Splits ALL orders (no state filter — callers filter as needed) into the
 * current 10-day window `[anchor-10d, anchor)` and the prior 10-day window
 * `[anchor-20d, anchor-10d)`, anchored to `state.generatedAt`. Orders outside
 * both windows (future-dated, or older than 20 days) are dropped from both
 * buckets.
 */
export function splitByPeriod(state: SeedState): PeriodSplit {
  const anchorMs = new Date(state.generatedAt).getTime();
  const current: Order[] = [];
  const prior: Order[] = [];

  for (const order of state.orders) {
    const createdMs = new Date(order.createdAt).getTime();
    const diff = anchorMs - createdMs;
    if (diff >= 0 && diff < 10 * DAY_MS) {
      current.push(order);
    } else if (diff >= 10 * DAY_MS && diff < 20 * DAY_MS) {
      prior.push(order);
    }
  }

  return { current, prior };
}
