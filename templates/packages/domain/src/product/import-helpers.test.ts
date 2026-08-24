import { describe, it, expect } from 'vitest';
import { parseProductCsv } from './import-helpers.js';

const HEADER = 'categoria;nombre;precio;moneda;barcode;sku;descripcion';

function csv(...lines: string[]): Buffer {
  return Buffer.from('\uFEFF' + [HEADER, ...lines].join('\r\n'), 'utf8');
}

describe('parseProductCsv', () => {
  it('parses a UTF-8 BOM file with CRLF endings and a quoted field containing ";"', () => {
    const buffer = csv(
      'Ropa;"Camisa; manga larga";1500.50;USD;7701234567890;CAM-001;"Descripción de prueba"',
    );

    const result = parseProductCsv(buffer, { maxRows: 1000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({
      categoria: 'Ropa',
      nombre: 'Camisa; manga larga',
      precio: '1500.50',
      moneda: 'USD',
      barcode: '7701234567890',
      sku: 'CAM-001',
      descripcion: 'Descripción de prueba',
    });
  });

  it('rejects the whole file when a header column is missing, naming the expected header', () => {
    const buffer = Buffer.from(
      '\uFEFFcategoria;nombre;precio;moneda;barcode;sku\r\nRopa;Camisa;10;USD;123;SKU1\r\n',
      'utf8',
    );

    const result = parseProductCsv(buffer, { maxRows: 1000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(HEADER);
  });

  it('rejects the whole file when a header column is misspelled', () => {
    const buffer = Buffer.from(
      '\uFEFFcategoria;nombre;precio;currency;barcode;sku;descripcion\r\n',
      'utf8',
    );

    const result = parseProductCsv(buffer, { maxRows: 1000 });

    expect(result.ok).toBe(false);
  });

  it('rejects the whole file when data rows exceed maxRows, stating the row cap', () => {
    const lines = Array.from({ length: 1001 }, (_, i) => `Ropa;Producto ${i};10;USD;;SKU-${i};`);
    const buffer = csv(...lines);

    const result = parseProductCsv(buffer, { maxRows: 1000 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('1000');
  });
});
