import {
  COMMISSION_KEYWORD_TABLE,
  buildCommissionAssignments,
  normalizeName,
} from './seed.js';

/**
 * Pure-function tests for the seed's matching rules. No database: the risky
 * part of this seed is the name→amount decision, and that decision has to be
 * inspectable without a Postgres round trip.
 *
 * Why the rules matter: a wrong match here becomes a wrong payout later, and
 * unlike a crash it looks perfectly normal.
 */
describe('commission seed — name resolution', () => {
  const table = COMMISSION_KEYWORD_TABLE;

  function product(id: string, name: string) {
    return { id, name };
  }

  /** Resolves a single name against the REAL table — the shape most cases need. */
  function amountFor(name: string): number | undefined {
    return buildCommissionAssignments([product('p1', name)], table).matched[0]?.amountMn;
  }

  describe('the table itself', () => {
    it('has no catch-all row — a fallback rule is not a product', () => {
      // The prototype ended its resolution with a 1000 catch-all and a set of
      // per-category defaults, so every unlisted product silently earned
      // something plausible. Both are deliberately absent here: an
      // unconfigured product must stay unresolved and visible.
      expect(amountFor('Cosa Absolutamente Desconocida XYZ')).toBeUndefined();
    });

    it('has no combo-bracket row — those are order-level, not per-product', () => {
      // "1 y 2 equipos → 3000" depends on how many items an ORDER carries.
      expect(table.some((r) => r.keywords.some((k) => k.includes('equipos')))).toBe(false);
      expect(table.some((r) => r.keywords.some((k) => k.includes('combo')))).toBe(false);
    });

    it('carries no keyword defined twice with conflicting amounts', () => {
      const byKeyword = new Map<string, number>();
      for (const row of table) {
        for (const keyword of row.keywords) {
          const seen = byKeyword.get(keyword);
          expect(seen === undefined || seen === row.amountMn).toBe(true);
          byKeyword.set(keyword, row.amountMn);
        }
      }
    });

    it('stores every keyword already normalized, so matching cannot silently miss', () => {
      for (const row of table) {
        for (const keyword of row.keywords) {
          expect(keyword).toBe(normalizeName(keyword));
        }
      }
    });
  });

  describe('matching — first row wins, in table order', () => {
    it('ignores accents and case, because the catalog is not typed consistently', () => {
      expect(amountFor('LÁMPARA SOLAR 800W')).toBe(2000);
    });

    it('matches a singular catalog name against the table keyword', () => {
      // The reason keywords are stems rather than the source doc's plural
      // headings: the catalog says "Nevera 3.5P Milexus", the doc says
      // "Neveras". A table written in the doc's words matches neither.
      expect(amountFor('Nevera 3.5P Milexus')).toBe(3000);
      expect(amountFor('Smart TV 43" HD')).toBe(3000);
      expect(amountFor('Toldo Impermeable 280G/M2')).toBe(2000);
      expect(amountFor('Inversor Solar 5KW')).toBe(5000);
    });

    /**
     * These four are the cases an earlier "longest matching key" heuristic got
     * wrong. They are pinned individually because each one is a real payout
     * that was, at some point, silently incorrect.
     */
    describe('cases the ordering exists to get right', () => {
      it('prices a refrigerator as a refrigerator, not as a door', () => {
        // `puerta` is the longer key and appears in the name. Order puts
        // `refrigerador` first, which is the whole point.
        expect(amountFor('Refrigerador Doble Puerta 16P')).toBe(4000);
        expect(amountFor('Puerta')).toBe(1000);
      });

      it('prices a split BRACKET as an accessory, not as an air conditioner', () => {
        expect(amountFor('Base para Split')).toBe(1000);
        expect(amountFor('Split 1T Inverter')).toBe(3000);
      });

      it('prices a TV bracket and a decoder box below the TV itself', () => {
        expect(amountFor('Base Fija para TV')).toBe(500);
        expect(amountFor('Cajita HD para TV')).toBe(1000);
        expect(amountFor('Smart TV 40 pulgadas')).toBe(3000);
      });

      it('prefers the dispenser tier over the filter tier for a combined product', () => {
        expect(amountFor('Dispensador con Filtro de Agua')).toBe(2000);
        expect(amountFor('Filtro de Agua')).toBe(1000);
      });
    });

    it('prices a pressure washer as one, not as a washing machine', () => {
      // "hidrolavadora" CONTAINS "lavadora". The inherited ordering had the
      // washing-machine rows first, which silently paid 3000 for a 2000 item.
      expect(amountFor('Hidrolavadora')).toBe(2000);
      expect(amountFor('Lavadora automática')).toBe(3000);
    });

    it('keeps the specific tier above the generic one for fans and ladders', () => {
      expect(amountFor('Ventilador Industrial 30" Royal')).toBe(3000);
      expect(amountFor('Ventilador de Techo')).toBe(2000);
      expect(amountFor('Ventilador 18"')).toBe(1000);
      expect(amountFor('Escalera 6 Peldaños')).toBe(2000);
      expect(amountFor('Escalera 4 Peldaños')).toBe(1000);
    });

    it('writes NO row for a product nothing matches, instead of inventing one', () => {
      const result = buildCommissionAssignments([product('p1', 'Vajilla de Porcelana')], table);

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedProducts).toEqual([{ id: 'p1', name: 'Vajilla de Porcelana' }]);
    });

    it('reports table rows that matched no product, so stale data is visible', () => {
      const result = buildCommissionAssignments([product('p1', 'Microondas')], table);

      expect(result.unusedReferences).toContain('Neveras');
      expect(result.unusedReferences).not.toContain('Microondas');
    });
  });

  describe('refusing to guess', () => {
    it('THROWS when the same keyword carries two different amounts', () => {
      // Order resolves precedence between DIFFERENT keywords. It cannot
      // resolve a keyword that contradicts itself, and choosing by position
      // would set someone's pay from a list they never saw.
      expect(() =>
        buildCommissionAssignments(
          [product('p1', 'Split')],
          [
            { keywords: ['split'], amountMn: 3000, label: 'Split' },
            { keywords: ['split'], amountMn: 4500, label: 'Split premium' },
          ],
        ),
      ).toThrow(/split/i);
    });

    it('accepts the same keyword repeated with the SAME amount — no information is lost', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Split 1T')],
        [
          { keywords: ['split'], amountMn: 3000, label: 'Split' },
          { keywords: ['split'], amountMn: 3000, label: 'Split (duplicate row)' },
        ],
      );

      expect(result.matched[0]!.amountMn).toBe(3000);
    });

    it('resolves two DIFFERENT keywords by order rather than throwing', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Combo silla y mesas de patio')],
        [
          { keywords: ['mesas'], amountMn: 2000, label: 'Mesas' },
          { keywords: ['silla'], amountMn: 1000, label: 'Silla' },
        ],
      );

      expect(result.matched[0]!.amountMn).toBe(2000);
      expect(result.matched[0]!.referenceName).toBe('Mesas');
    });
  });
});
