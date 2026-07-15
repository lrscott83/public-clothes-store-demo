import { useMemo, useState } from 'react';
import type { Route } from './+types/decisiones';
import { loadSeedState } from '../store/seed-store';
import {
  buildActiveOrdersByStateAndWarehouse,
  buildTransportistaCapacity,
  buildComisionesPorPagar,
  buildPedidosDemorados,
  buildInventoryAlerts,
  buildEntraVsSale,
  buildCicloPromedio,
  buildPedidosPorDia,
  buildCompletadosPorDia,
  buildWarehouseSales,
  buildCurrencyMix,
  buildGestorRanking,
  windowedState,
  type WindowDays,
} from '../domain/decisiones-dashboard';
import { ActiveOrdersChart } from '../components/decisiones/active-orders-chart';
import { TransportistaCapacity } from '../components/decisiones/transportista-capacity';
import { ComisionesPorPagar } from '../components/decisiones/comisiones-por-pagar';
import { InventoryAlerts } from '../components/decisiones/inventory-alerts';
import { PedidosDemorados } from '../components/decisiones/pedidos-demorados';
import { PeriodFilter } from '../components/decisiones/period-filter';
import { EntraVsSale } from '../components/decisiones/entra-vs-sale';
import { CicloPromedio } from '../components/decisiones/ciclo-promedio';
import { PedidosPorDia } from '../components/decisiones/pedidos-por-dia';
import { CompletadosPorDia } from '../components/decisiones/completados-por-dia';
import { WarehouseSales } from '../components/decisiones/warehouse-sales';
import { CurrencyMix } from '../components/decisiones/currency-mix';
import { GestorRanking, type GestorRankingPeriod } from '../components/decisiones/gestor-ranking';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Decisiones — Sales Ops Cockpit' }];
}

const EMPTY_STATE_MESSAGE = 'No hay pedidos verificados o posteriores todavía — este bloque aparecerá aquí una vez existan.';

/**
 * Read-only operational cockpit driven by local `useState` — direct render,
 * no RR7 `<Form>`/action/loader, no `useNavigate` (sidesteps the
 * jsdom+undici `AbortSignal` gotcha), mirroring `finanzas.tsx`/`inventario.tsx`.
 * `seed` loads once via `loadSeedState()` and is never re-read or mutated;
 * every view model is a `useMemo` over pure domain builders.
 *
 * Layout, top to bottom:
 * - Capa 1 — Pulso inmediato: 3 cards (activos por estado/almacén,
 *   transportistas, comisiones por pagar). 1.1/1.2 are window-independent and
 *   exempt from the "no verificado-or-later orders" empty state (they count
 *   `creado` orders / derive from transportistas, not from qualifying
 *   orders); 1.3 shows a genuine empty-state message instead of a fabricated
 *   zero when `hasQualifyingData` is false.
 * - Capa 2 — Qué atiendo YA: stock crítico + pedidos demorados. Both are
 *   window-independent and exempt from the empty state.
 * - Capa 3 — Comportamiento en el tiempo: single `[7d/30d]` filter shared by
 *   all 4 blocks; empty-state message when `hasQualifyingData` is false.
 * - Análisis: Ventas por almacén + Mix por moneda share the SAME `windowDays`
 *   state as Capa 3 (via `windowedState`); Ranking de gestores carries its
 *   own independent `[7d/30d/General]` selector. Empty-state message when
 *   `hasQualifyingData` is false.
 */
export default function Decisiones() {
  const [seed] = useState(() => loadSeedState());
  const [windowDays, setWindowDays] = useState<WindowDays>(7);
  const [gestorPeriod, setGestorPeriod] = useState<GestorRankingPeriod>(7);

  const hasQualifyingData = useMemo(() => seed.orders.some((order) => order.state !== 'creado'), [seed]);

  // Capa 1 + Capa 2 — window-independent, computed once from `seed`.
  const activeOrders = useMemo(() => buildActiveOrdersByStateAndWarehouse(seed), [seed]);
  const transportistaCapacity = useMemo(() => buildTransportistaCapacity(seed), [seed]);
  const comisiones = useMemo(() => buildComisionesPorPagar(seed), [seed]);
  const inventoryAlerts = useMemo(() => buildInventoryAlerts(seed), [seed]);
  const pedidosDemorados = useMemo(() => buildPedidosDemorados(seed), [seed]);

  // Capa 3 — recompute together whenever windowDays changes.
  const entraVsSale = useMemo(() => buildEntraVsSale(seed, windowDays), [seed, windowDays]);
  const ciclo = useMemo(() => buildCicloPromedio(seed, windowDays), [seed, windowDays]);
  const pedidosPorDia = useMemo(() => buildPedidosPorDia(seed, windowDays), [seed, windowDays]);
  const completadosPorDia = useMemo(() => buildCompletadosPorDia(seed, windowDays), [seed, windowDays]);

  // Análisis — Ventas por almacén + Mix por moneda share Capa 3's windowDays.
  const analysisState = useMemo(() => windowedState(seed, windowDays), [seed, windowDays]);
  const warehouses = useMemo(() => buildWarehouseSales(analysisState), [analysisState]);
  const currencyMix = useMemo(() => buildCurrencyMix(analysisState), [analysisState]);

  // Ranking de gestores — independent [7d/30d/General] selector.
  const gestorState = useMemo(
    () => (gestorPeriod === 'general' ? seed : windowedState(seed, gestorPeriod)),
    [seed, gestorPeriod],
  );
  const gestores = useMemo(() => buildGestorRanking(gestorState), [gestorState]);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-text">Decisiones</h1>

      {/* Capa 1 — Pulso inmediato */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ActiveOrdersChart activeOrders={activeOrders} />
        <TransportistaCapacity capacity={transportistaCapacity} />
        {hasQualifyingData ? (
          <ComisionesPorPagar comisiones={comisiones} />
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="text-lg font-semibold text-text">Comisiones por pagar</h2>
            <p className="mt-3 text-sm text-text-muted">{EMPTY_STATE_MESSAGE}</p>
          </div>
        )}
      </div>

      {/* Capa 2 — Qué atiendo YA */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <InventoryAlerts alerts={inventoryAlerts} />
        <PedidosDemorados demorados={pedidosDemorados} />
      </div>

      {/* Capa 3 — Comportamiento en el tiempo */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text">Comportamiento en el tiempo</h2>
          <PeriodFilter value={windowDays} onChange={setWindowDays} />
        </div>
        {hasQualifyingData ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <EntraVsSale entraVsSale={entraVsSale} />
            <CicloPromedio ciclo={ciclo} />
            <PedidosPorDia pedidos={pedidosPorDia} />
            <CompletadosPorDia completados={completadosPorDia} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">{EMPTY_STATE_MESSAGE}</p>
        )}
      </div>

      {/* Análisis */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text">Análisis</h2>
          {hasQualifyingData && <PeriodFilter value={windowDays} onChange={setWindowDays} />}
        </div>
        {hasQualifyingData ? (
          <>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <WarehouseSales warehouses={warehouses} />
              <CurrencyMix currencyMix={currencyMix} />
            </div>
            <div className="mt-4">
              <GestorRanking gestores={gestores} period={gestorPeriod} onPeriodChange={setGestorPeriod} />
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-text-muted">{EMPTY_STATE_MESSAGE}</p>
        )}
      </div>
    </main>
  );
}
