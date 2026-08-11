import { BadRequestException } from '@nestjs/common';
import type { PublicProductSort } from './public-product.service.js';

export interface ParsedPublicProductQuery {
  readonly q?: string;
  readonly categoria?: string;
  readonly orden: PublicProductSort;
  readonly pagina: number;
  readonly porPagina: number;
}

const VALID_SORTS: ReadonlySet<string> = new Set(['destacado', 'precio-asc', 'precio-desc', 'nombre']);
const VALID_PAGE_SIZES: ReadonlySet<number> = new Set([12, 24, 48]);
const MAX_SEARCH_LENGTH = 100;
const DEFAULT_PAGE_SIZE = 12;

/**
 * design.md §3's query-parameter table. `orden`/`porPagina` are OUR OWN
 * enums (`/productos?orden=`) — an unrecognised value is a typo, not user
 * input to tolerate, so both reject with 400. `pagina`/`q` are forgiving:
 * an out-of-range or malformed page number just falls back to page 1
 * (an empty-but-exact result, never a 400), and `q` is trimmed and
 * truncated rather than rejected.
 */
export function parsePublicProductQuery(
  raw: Record<string, string | undefined>,
): ParsedPublicProductQuery {
  const ordenRaw = raw.orden ?? 'destacado';
  if (!VALID_SORTS.has(ordenRaw)) {
    throw new BadRequestException(`Unknown orden: "${ordenRaw}"`);
  }

  const porPaginaRaw = raw.porPagina !== undefined ? Number(raw.porPagina) : DEFAULT_PAGE_SIZE;
  if (!VALID_PAGE_SIZES.has(porPaginaRaw)) {
    throw new BadRequestException(`Unknown porPagina: "${raw.porPagina}"`);
  }

  const paginaParsed = raw.pagina !== undefined ? Number(raw.pagina) : 1;
  const pagina = Number.isInteger(paginaParsed) && paginaParsed >= 1 ? paginaParsed : 1;

  const trimmedSearch = raw.q?.trim();
  const q = trimmedSearch ? trimmedSearch.slice(0, MAX_SEARCH_LENGTH) : undefined;

  return {
    q,
    categoria: raw.categoria || undefined,
    orden: ordenRaw as PublicProductSort,
    pagina,
    porPagina: porPaginaRaw,
  };
}
