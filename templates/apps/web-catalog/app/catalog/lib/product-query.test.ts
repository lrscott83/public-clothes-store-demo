import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  buildFilterSearchParams,
  pageCount,
  paginationRange,
  parseProductFilters,
} from './product-query';

describe('parseProductFilters', () => {
  it('defaults orden=destacado, pagina=1, porPagina=12, categoria/q empty when absent', () => {
    expect(parseProductFilters(new URLSearchParams())).toEqual({
      q: '',
      categoria: '',
      orden: DEFAULT_SORT,
      pagina: 1,
      porPagina: DEFAULT_PAGE_SIZE,
    });
  });

  it('reads every filter verbatim off the search params', () => {
    const searchParams = new URLSearchParams({
      q: 'remera',
      categoria: 'remeras',
      orden: 'precio-asc',
      pagina: '3',
      porPagina: '24',
    });

    expect(parseProductFilters(searchParams)).toEqual({
      q: 'remera',
      categoria: 'remeras',
      orden: 'precio-asc',
      pagina: 3,
      porPagina: 24,
    });
  });

  it('falls back to the default sort for an unrecognized orden — never throws in the UI', () => {
    const searchParams = new URLSearchParams({ orden: 'barato' });
    expect(parseProductFilters(searchParams).orden).toBe(DEFAULT_SORT);
  });

  it('falls back to the default page size for an unrecognized porPagina', () => {
    const searchParams = new URLSearchParams({ porPagina: '13' });
    expect(parseProductFilters(searchParams).porPagina).toBe(DEFAULT_PAGE_SIZE);
  });

  it('falls back to page 1 for a non-integer or sub-1 pagina', () => {
    expect(parseProductFilters(new URLSearchParams({ pagina: '0' })).pagina).toBe(1);
    expect(parseProductFilters(new URLSearchParams({ pagina: 'abc' })).pagina).toBe(1);
  });
});

describe('buildFilterSearchParams', () => {
  it('merges a patch onto the current params', () => {
    const current = new URLSearchParams({ categoria: 'remeras' });
    const next = buildFilterSearchParams(current, { q: 'azul' });

    expect(next.get('categoria')).toBe('remeras');
    expect(next.get('q')).toBe('azul');
  });

  it('resets pagina to 1 (deletes it) when a non-page filter changes', () => {
    const current = new URLSearchParams({ pagina: '4', categoria: 'remeras' });
    const next = buildFilterSearchParams(current, { categoria: 'pantalones' });

    expect(next.has('pagina')).toBe(false);
    expect(next.get('categoria')).toBe('pantalones');
  });

  it('does NOT reset pagina when only pagina itself changes', () => {
    const current = new URLSearchParams({ categoria: 'remeras' });
    const next = buildFilterSearchParams(current, { pagina: 3 });

    expect(next.get('pagina')).toBe('3');
    expect(next.get('categoria')).toBe('remeras');
  });

  it('deletes a key set back to its own default so the URL stays minimal', () => {
    const current = new URLSearchParams({ orden: 'precio-asc', porPagina: '24' });
    const next = buildFilterSearchParams(current, { orden: DEFAULT_SORT, porPagina: DEFAULT_PAGE_SIZE });

    expect(next.has('orden')).toBe(false);
    expect(next.has('porPagina')).toBe(false);
  });

  it('deletes a key set to an empty string', () => {
    const current = new URLSearchParams({ categoria: 'remeras' });
    const next = buildFilterSearchParams(current, { categoria: '' });

    expect(next.has('categoria')).toBe(false);
  });
});

describe('pageCount', () => {
  it('rounds up and never returns less than 1', () => {
    expect(pageCount(13, 12)).toBe(2);
    expect(pageCount(0, 12)).toBe(1);
    expect(pageCount(12, 12)).toBe(1);
  });
});

describe('paginationRange', () => {
  it('returns every page with no ellipsis when total <= 5', () => {
    expect(paginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(paginationRange(1, 1)).toEqual([1]);
  });

  it('anchors the first 4 pages + ellipsis + last when current is near the start', () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, 'ellipsis', 10]);
  });

  it('anchors first + ellipsis + last 4 pages when current is near the end', () => {
    expect(paginationRange(10, 10)).toEqual([1, 'ellipsis', 7, 8, 9, 10]);
  });

  it('anchors first + ellipsis + neighbors + ellipsis + last when current is in the middle', () => {
    expect(paginationRange(5, 10)).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);
  });
});
