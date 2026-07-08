import { describe, expect, it } from 'vitest';
import { deriveCommission, normalizeName } from '../commission-map';

describe('normalizeName', () => {
  it('lowercases and strips accents/diacritics', () => {
    expect(normalizeName('Cafetera de Fogón')).toBe('cafetera de fogon');
  });

  it('collapses punctuation/quotes/whitespace', () => {
    expect(normalizeName('Ventilador Industrial 30" Royal')).toBe('ventilador industrial 30 royal');
    expect(normalizeName('Base Fija para TV')).toBe('base fija para tv');
  });
});

describe('deriveCommission — keyword precedence', () => {
  it('matches "lavadora semi" before the generic "lavadora" tier', () => {
    expect(deriveCommission('Lavadora Semi Automática', 'lavadoras')).toEqual({
      commissionMN: 3000,
      rule: 'keyword',
    });
  });

  it('matches "escalera 6" before the generic "escalera" tier', () => {
    expect(deriveCommission('Escalera 6 Peldaños', 'utiles')).toEqual({
      commissionMN: 2000,
      rule: 'keyword',
    });
    expect(deriveCommission('Escalera 4 Peldaños', 'utiles')).toEqual({
      commissionMN: 1000,
      rule: 'keyword',
    });
  });

  it('matches the bare "base" keyword only as a last resort', () => {
    // No other keyword substring (split, tv, giratoria, pared, paneles...)
    // is present, so only tier 41 ("base", bare) can fire.
    expect(deriveCommission('Base Genérica de Repuesto', 'climatizacion')).toEqual({
      commissionMN: 500,
      rule: 'keyword',
    });
  });

  it('matches the specific "base para split" accessory tier before the bare "split" tier', () => {
    expect(deriveCommission('Base para Split', 'climatizacion')).toEqual({
      commissionMN: 1000,
      rule: 'keyword',
    });
  });

  it('falls back to the category default when no keyword matches', () => {
    expect(deriveCommission('Licuadora Milexus 1.5L 2 en 1', 'licuadoras')).toEqual({
      commissionMN: 1000,
      rule: 'category-default',
    });
  });

  it('falls back to the 1000 catch-all when neither keyword nor category default apply', () => {
    expect(deriveCommission('Producto Desconocido', 'categoria-inexistente')).toEqual({
      commissionMN: 1000,
      rule: 'catch-all',
    });
  });

  it('sums bundle segments joined by " + "', () => {
    expect(deriveCommission('Split 1T + Base', 'climatizacion')).toEqual({
      commissionMN: 3500,
      rule: 'bundle-sum',
    });
    expect(
      deriveCommission('Kit 3.84KW: Inversor MUST 3KW + 2 Baterías 1.92KWh', 'energia-solar'),
    ).toEqual({
      commissionMN: 10000,
      rule: 'bundle-sum',
    });
  });
});

describe('deriveCommission — 2026-07-08 business review corrections', () => {
  it('resolves TV base accessories to the 500 base tier, not the 3000 bare "tv" tier', () => {
    expect(deriveCommission('Base Fija para TV', 'tv-y-audio')).toEqual({
      commissionMN: 500,
      rule: 'keyword',
    });
    expect(deriveCommission('Base para TV a la Pared Giratoria', 'tv-y-audio')).toEqual({
      commissionMN: 500,
      rule: 'keyword',
    });
  });

  it('resolves a bare "cajita" product to 1000, not the 3000 bare "tv" tier', () => {
    expect(deriveCommission('Cajita HD para TV', 'tv-y-audio')).toEqual({
      commissionMN: 1000,
      rule: 'keyword',
    });
  });

  it('resolves "Cocina de Inducción" / "Fogón de gas" / "Cocina infrarroja" to 2000, not the cocinas category default', () => {
    expect(deriveCommission('Cocina de Inducción Milexus', 'cocinas')).toEqual({
      commissionMN: 2000,
      rule: 'keyword',
    });
    expect(deriveCommission('Fogón de gas Rudenkov', 'cocinas')).toEqual({
      commissionMN: 2000,
      rule: 'keyword',
    });
    expect(deriveCommission('Cocina infrarroja', 'cocinas')).toEqual({
      commissionMN: 2000,
      rule: 'keyword',
    });
  });

  it('recomputes 3-segment TV bundles (smart tv + cajita + base) to the corrected 4500 total', () => {
    expect(
      deriveCommission('Smart TV + Cajita Decodificadora HD + Base de Pared Giratoria', 'tv-y-audio'),
    ).toEqual({ commissionMN: 4500, rule: 'bundle-sum' }); // 3000 + 1000 + 500
  });

  it('leaves 2-segment TV bundles (smart tv + base, no cajita) unchanged at 3500', () => {
    expect(deriveCommission('Smart TV 43" + Base Giratoria', 'tv-y-audio')).toEqual({
      commissionMN: 3500,
      rule: 'bundle-sum',
    }); // 3000 + 500, no cajita segment involved
  });
});
