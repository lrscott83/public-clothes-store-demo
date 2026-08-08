import { describe, expect, it } from 'vitest';
import { WAREHOUSE_COLORS } from '../warehouse-colors';

describe('WAREHOUSE_COLORS', () => {
  it('maps each seeded warehouseId to a fixed color, independent of data', () => {
    expect(WAREHOUSE_COLORS['wh-1']).toBe('#16a34a'); // Pinar del Río — verde
    expect(WAREHOUSE_COLORS['wh-2']).toBe('#2563eb'); // Consolación del Sur — azul
    expect(WAREHOUSE_COLORS['wh-3']).toBe('#eab308'); // Herradura — amarillo
  });

  it('is a plain lookup keyed by warehouseId, stable across calls', () => {
    const first = WAREHOUSE_COLORS['wh-2'];
    const second = WAREHOUSE_COLORS['wh-2'];
    expect(first).toBe(second);
  });
});
