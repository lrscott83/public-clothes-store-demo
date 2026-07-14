/**
 * Plain-language explanations shown by each card's `InfoPopover` on
 * `/finanzas`. Same `HelpEntry` shape and warm Rioplatense voice as
 * `DECISIONES_HELP` — this extends an existing Spanish dashboard.
 *
 * Caveat-critical framings (non-negotiable, see design.md §5 ADR):
 * - Every sale is fully collected — there is no customer receivable, so no
 *   copy anywhere frames revenue as "por cobrar" or partially uncollected.
 * - "Ingresos liquidados (MN)" frames revenue settled in the local,
 *   devaluing currency = FX exposure, not cash-in-hand.
 * - "Comisión pagada" is commission paid TO GESTORES (`commissionPaidAt`) —
 *   the only liability the app presents is the owner's debt to gestores,
 *   never money owed BY a customer.
 * - No goal/target copy anywhere; no Gross/Net/Fees/refunds vocabulary.
 */
export interface HelpEntry {
  title: string;
  text: string;
}

export const FINANZAS_HELP = {
  // --- KPI header (Layer 1) ---
  ingresosFacturados: {
    title: 'Ingresos facturados',
    text: 'Cuánto facturaste en dólares en los últimos 10 días, sobre pedidos verificados o posteriores. La flecha compara contra los 10 días previos.',
  },
  ingresosLiquidados: {
    title: 'Ingresos liquidados (MN)',
    text: 'Lo mismo que facturaste, pero expresado en moneda nacional al tipo de cambio de cada venta. No es plata en caja: es tu exposición real a la devaluación de la MN.',
  },
  comisionPendiente: {
    title: 'Comisión pendiente',
    text: 'Lo que todavía les debés a tus gestores por sus ventas, en moneda nacional (MN). Es plata ya comprometida que va a salir: tenela presente antes de gastarla.',
  },
  margenNeto: {
    title: 'Margen neto',
    text: 'Lo que te queda después de restar el costo de la mercadería y la comisión del gestor a lo facturado. El porcentaje muestra cuánto de cada venta es ganancia real, últimos 10 días.',
  },

  // --- Layer 2 (visual sections) ---
  tendenciaVentas: {
    title: 'Ventas por día',
    text: 'Cómo se movió tu facturación, día a día, en los últimos 20 días. Cada venta acá ya está totalmente realizada — no hay plata pendiente de cobro, es facturación real.',
  },
  comisionPagadaPendiente: {
    title: 'Comisión pagada vs pendiente',
    text: 'Cuánto ya le pagaste a tus gestores (comisión pagada, evento `commissionPaidAt`) contra cuánto todavía les debés. Esta es la única deuda que maneja el panel — vos le debés a ellos, nunca al revés.',
  },
  ingresosPorEstado: {
    title: 'Ingresos por estado',
    text: 'Cuánta facturación tenés en cada etapa del pedido. Si se amontona en una etapa temprana, ahí tenés pedidos que todavía no avanzaron por el flujo operativo.',
  },
  mixPorMoneda: {
    title: 'Mix por moneda',
    text: 'Qué parte de tu facturación entra en moneda fuerte (USD, Zelle, EUR) contra moneda nacional. Cuanto más dependas de la MN, más expuesto estás a que una devaluación te licúe la ganancia.',
  },

  // --- Layer 3 (actionable blocks) ---
  comisionRoiGestor: {
    title: 'Comisión y ROI por gestor',
    text: 'Cuánto le generó cada gestor en ventas contra cuánto te costó en comisión: pagada, pendiente (la devengada es la suma de ambas), el take-rate (% de la venta que se va en comisión) y el ROI (cuánto facturás por cada peso de comisión).',
  },
  ventasPorAlmacen: {
    title: 'Ventas por almacén',
    text: 'Cuánto vende cada almacén. Te muestra qué punto empuja el negocio y cuál está quedando dormido, para reforzar stock o atención donde de verdad rinde.',
  },
} satisfies Record<string, HelpEntry>;
