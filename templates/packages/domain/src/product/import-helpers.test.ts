import { describe, it, expect } from 'vitest';
import { parseProductCsv, slugify, toTitleCase } from './import-helpers.js';

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

describe('toTitleCase', () => {
  it('capitalizes each whitespace-separated word', () => {
    expect(toTitleCase('iphone case')).toBe('Iphone Case');
  });

  it('handles multi-word and multi-space input without collapsing spaces', () => {
    expect(toTitleCase('ropa interior  de  invierno')).toBe('Ropa Interior  De  Invierno');
  });

  it('uppercases the first letter but preserves the rest of each word', () => {
    expect(toTitleCase('ipHONE case')).toBe('IpHONE Case');
  });

  it('has no Spanish special-casing (no small-word exceptions)', () => {
    expect(toTitleCase('camisa de manga larga')).toBe('Camisa De Manga Larga');
  });
});

describe('slugify', () => {
  it('lowercases, strips accents via NFD, hyphenates non-alphanumerics and collapses repeats', () => {
    expect(slugify('Climatización')).toBe('climatizacion');
    expect(slugify('  Ropa   Interior ')).toBe('ropa-interior');
    expect(slugify('Calzado & Deporte!')).toBe('calzado-deporte');
    expect(slugify('Máquina--de Coser nº3')).toBe('maquina-de-coser-n-3');
  });
});
