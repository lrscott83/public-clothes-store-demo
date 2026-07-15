/**
 * Presentation-only constant: a fixed color per seeded `warehouseId`,
 * independent of order data or aggregation results. Shared by Capa 1.1
 * ("Pedidos activos por estado y almacén") and Análisis' "Ventas por
 * almacén" so a given warehouse always renders in the same color.
 *
 * Keyed by id (not name) so it stays stable across warehouse renames.
 */
export const WAREHOUSE_COLORS: Record<string, string> = {
  'wh-1': '#16a34a', // Pinar del Río — verde
  'wh-2': '#2563eb', // Consolación del Sur — azul
  'wh-3': '#eab308', // Herradura — amarillo
};
