/**
 * Plain-language explanations shown by each card's `InfoPopover` on `/decisiones`.
 * Written for the business owner (not the analyst): what the card is worth and
 * what its numbers mean, in one or two sentences, with a hook toward acting on it.
 * Keep the voice warm and direct — this copy is the "why should I care" for each card.
 */
export interface HelpEntry {
  title: string;
  text: string;
}

export const DECISIONES_HELP = {
  // --- Capa 1 — Pulso inmediato ---
  pedidosActivos: {
    title: 'Pedidos activos por estado y almacén',
    text: 'Cuántos pedidos tenés en curso ahora mismo (creados, verificados, en camino), por almacén. Si se amontonan en una etapa o un almacén, ahí tenés un cuello de botella que atender hoy.',
  },
  transportistas: {
    title: 'Transportistas',
    text: 'Quién está repartiendo ahora y quién tenés libre. "Sin chofer" cuenta pedidos ya verificados que todavía no tienen quién los lleve: son entregas frenadas por falta de asignación.',
  },
  comisionesPorPagar: {
    title: 'Comisiones por pagar',
    text: 'Lo que les debés a tus gestores en moneda nacional (MN), y quién lleva más días esperando su cobro. Es plata comprometida: priorizá pagar a quien está más atrasado.',
  },

  // --- Capa 2 — Qué atiendo YA ---
  pedidosDemorados: {
    title: 'Pedidos demorados/trabados',
    text: 'Pedidos parados más tiempo del normal en su etapa actual (creado, verificado o en camino). Cada uno es una entrega frenada: revisalos hoy antes de que se conviertan en un reclamo.',
  },

  // --- KPI header (Layer 1) ---
  ventas: {
    title: 'Ventas',
    text: 'Cuánto facturaste en dólares en los últimos 10 días. La flecha compara contra los 10 días previos: verde subís, rojo bajás. Es tu pulso más rápido para saber si el negocio acelera o se enfría.',
  },
  margen: {
    title: 'Margen',
    text: 'Lo que te queda después de pagar el costo de la mercadería. El porcentaje muestra cuánto de cada venta es ganancia real. Vender mucho con margen bajo llena de trabajo, no de dinero.',
  },
  pedidos: {
    title: 'Pedidos',
    text: 'Cuántos pedidos cerraste en los últimos 10 días. La flecha compara contra los 10 días previos: es tu pulso de volumen, cuánto se mueve el negocio.',
  },
  comisionPendiente: {
    title: 'Comisión pendiente',
    text: 'Lo que todavía les debés a tus gestores por sus ventas, en moneda nacional (MN). Es dinero ya comprometido que va a salir: tenelo presente antes de gastarlo.',
  },

  // --- Layer 2 (visual sections) ---
  pedidosPorEtapa: {
    title: 'Pedidos por etapa',
    text: 'Dónde están parados hoy tus pedidos: creados, verificados, en camino, entregados. Si se amontonan en una etapa, ahí tenés un cuello de botella que te frena el dinero.',
  },
  tendenciaVentas: {
    title: 'Tendencia de ventas',
    text: 'Cómo se movieron tus ventas día a día en los últimos 20 días. Cambiá entre "Valor" (dólares) y "Cantidad" (pedidos) para ver si crecés en facturación, en volumen, o en ninguno.',
  },
  ventasPorAlmacen: {
    title: 'Ventas por almacén',
    text: 'Cuánto vende cada almacén. Te muestra qué punto empuja el negocio y cuál está quedando dormido, para reforzar stock o atención donde de verdad rinde.',
  },
  mixPorMoneda: {
    title: 'Mix por moneda',
    text: 'En qué monedas o métodos te pagan (USD, MN, Zelle…). Conocer tu mezcla te ayuda a manejar el tipo de cambio y a no quedar demasiado expuesto a una sola moneda.',
  },

  // --- Layer 3 (actionable blocks) ---
  rankingGestores: {
    title: 'Ranking de gestores',
    text: 'Tu equipo de ventas ordenado por facturación: ventas, pedidos, ticket promedio y comisiones. De un vistazo ves quién empuja y quién necesita una mano.',
  },
  alertasInventario: {
    title: 'Alertas de inventario',
    text: 'Productos bajos o agotados por almacén, los más urgentes primero. Cada faltante es una venta que se te escapa: esta lista te dice qué reponer ya.',
  },
} satisfies Record<string, HelpEntry>;
