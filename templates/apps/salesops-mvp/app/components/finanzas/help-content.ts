/**
 * Plain-language explanations shown by each card's `InfoPopover` on
 * `/finanzas`. Same `HelpEntry` shape and warm Rioplatense voice as
 * `DECISIONES_HELP` — this extends an existing Spanish dashboard.
 *
 * Caveat-critical framings (non-negotiable, see design.md Decision 4):
 * - "Cobrado vs pendiente" is a STATE proxy, never a cash register — copy
 *   says "aprox./estimado", never "recibido".
 * - "Ingresos liquidados (MN)" frames revenue settled in the local,
 *   devaluing currency = FX exposure, not cash-in-hand.
 * - "Comisión pagada" is commission paid TO GESTORES (`commissionPaidAt`),
 *   a DIFFERENT event from client "cobrado" (order-state inferred) — never
 *   conflated.
 * - "Tendencia de cobros" is titled as an estimate; help repeats the proxy
 *   caveat.
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
  cobradoPendiente: {
    title: 'Cobrado vs pendiente',
    text: 'Aproximación por estado del pedido (entregado / comisión pagada = cobrado; verificado / transportando = pendiente). No es un registro de caja real: es una estimación, no un extracto bancario.',
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
  tendenciaCobros: {
    title: 'Cobros estimados por estado',
    text: 'Cómo se movió, día a día en los últimos 20 días, el dinero estimado como cobrado y el que sigue pendiente. Es una aproximación por estado del pedido, no un movimiento de caja real.',
  },
  comisionPagadaPendiente: {
    title: 'Comisión pagada vs pendiente',
    text: 'Cuánto ya le pagaste a tus gestores (comisión pagada, evento `commissionPaidAt`) contra cuánto todavía les debés. Ojo: esto es distinto de si el CLIENTE te pagó a vos — son dos eventos separados.',
  },
  ingresosPorEstado: {
    title: 'Ingresos por estado',
    text: 'Cuánta facturación tenés parada en cada etapa del pedido. Si se amontona en una etapa temprana, ahí tenés plata que todavía no terminó de convertirse en cobro.',
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
  cobrosPendientesAlmacen: {
    title: 'Cobros pendientes por almacén',
    text: 'Cuánta plata estimada sigue trabada en cada almacén, cobrada o pendiente. Un almacén con mucho pendiente es plata que todavía no terminó de entrar.',
  },
} satisfies Record<string, HelpEntry>;
