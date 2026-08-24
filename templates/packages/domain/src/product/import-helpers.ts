/**
 * CSV business grammar for bulk product import (spec: salesops-product-import).
 * Pure functions only — no transport or repository concerns.
 *
 * Header contract: exactly `categoria;nombre;precio;moneda;barcode;sku;descripcion`
 * (`;`-separated, that order). UTF-8 with or without BOM; CRLF or LF endings;
 * RFC-4180-style quoting for fields containing `;`, quotes, or newlines.
 */

/** The exact header row every import file must carry, in order. */
export const PRODUCT_CSV_HEADER = [
  'categoria',
  'nombre',
  'precio',
  'moneda',
  'barcode',
  'sku',
  'descripcion',
] as const;

export type ProductCsvColumnName = (typeof PRODUCT_CSV_HEADER)[number];

/** One parsed CSV data row, keyed by column name. All values are raw strings. */
export interface ProductCsvRow extends Record<ProductCsvColumnName, string> {}

export type ParseProductCsvResult =
  | { ok: true; rows: ProductCsvRow[] }
  | { ok: false; reason: string };

/** Hard cap on data rows per file (whole-file rejection beyond it). */
export const MAX_CSV_DATA_ROWS = 1000;

/**
 * Splits a raw CSV text into records/fields honoring RFC-4180-style quoting:
 * a field wrapped in double quotes may contain `;`, `"` (doubled), and
 * embedded newlines.
 */
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ';') {
      record.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\r' || char === '\n') {
      // Tolerate CRLF and LF as record separators outside quotes.
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  // Final record without trailing newline.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/**
 * Parses an uploaded CSV buffer into typed rows. Whole-file failures (missing/
 * wrong header, more than `maxRows` data rows) return `{ ok: false, reason }`
 * with a Spanish reason naming either the expected header or the exceeded cap.
 */
export function parseProductCsv(
  buffer: Buffer,
  options: { maxRows?: number },
): ParseProductCsvResult {
  const maxRows = options.maxRows ?? MAX_CSV_DATA_ROWS;

  // Strip UTF-8 BOM before decoding the header contract.
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const records = parseCsvRecords(text);

  if (records.length === 0) {
    return { ok: false, reason: `El archivo está vacío. Encabezado esperado: ${PRODUCT_CSV_HEADER.join(';')}` };
  }

  const header = records[0]!.map((column) => column.trim());
  const expected = [...PRODUCT_CSV_HEADER];
  const headerMatches =
    header.length === expected.length && header.every((column, index) => column === expected[index]);
  if (!headerMatches) {
    return {
      ok: false,
      reason: `Encabezado inválido. El archivo debe comenzar exactamente con: ${expected.join(';')}`,
    };
  }

  const dataRecords = records.slice(1).filter((record) => !(record.length === 1 && record[0] === ''));
  if (dataRecords.length > maxRows) {
    return {
      ok: false,
      reason: `El archivo supera el límite de ${maxRows} filas de datos (${dataRecords.length} recibidas). Dividí el archivo en varios lotes.`,
    };
  }

  const rows: ProductCsvRow[] = dataRecords.map((record) => ({
    categoria: record[0] ?? '',
    nombre: record[1] ?? '',
    precio: record[2] ?? '',
    moneda: record[3] ?? '',
    barcode: record[4] ?? '',
    sku: record[5] ?? '',
    descripcion: record[6] ?? '',
  }));

  return { ok: true, rows };
}
