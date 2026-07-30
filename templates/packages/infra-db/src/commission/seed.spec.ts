import {
  COMMISSION_REFERENCE_TABLE,
  buildCommissionAssignments,
  normalizeName,
} from './seed.js';

/**
 * Pure-function tests for the seed's matching rules. No database: the risky
 * part of this seed is the name→amount decision, and that decision has to be
 * inspectable without a Postgres round trip.
 *
 * Why the rules matter: a wrong match here becomes a wrong payout later, and
 * unlike a crash it looks perfectly normal. The rules are therefore chosen so
 * that every uncertain case is either resolved deterministically or refused
 * loudly — never guessed.
 */
describe('commission seed — name resolution', () => {
  const table = COMMISSION_REFERENCE_TABLE;

  function product(id: string, name: string) {
    return { id, name };
  }

  describe('the reference table itself', () => {
    it('excludes the catch-all row — a fallback rule is not a product', () => {
      // `Demás equipos pequeños | 1000` is a RULE for anything unlisted.
      // Seeding it as if it were a product would silently price every
      // unconfigured item, which is the exact coercion this module forbids.
      expect(table.some((r) => normalizeName(r.name).includes('demas equipos'))).toBe(false);
    });

    it('excludes the combo brackets — they are order-level, not per-product', () => {
      // "1 y 2 equipos → 3000" depends on how many items an ORDER carries, a
      // different shape from this per-product table. Left out deliberately
      // rather than approximated.
      expect(table.some((r) => normalizeName(r.name).includes('equipos'))).toBe(false);
      expect(table.some((r) => normalizeName(r.name).includes('combo'))).toBe(false);
    });

    it('carries no duplicate normalized key with a conflicting amount', () => {
      const byKey = new Map<string, number>();
      for (const row of table) {
        const key = normalizeName(row.name);
        const seen = byKey.get(key);
        expect(seen === undefined || seen === row.amountMn).toBe(true);
        byKey.set(key, row.amountMn);
      }
    });
  });

  describe('matching', () => {
    it('prefers an exact normalized match', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Neveras')],
        [
          { name: 'Neveras', amountMn: 3000 },
          { name: 'Neveras de 16 y 20 pies', amountMn: 4000 },
        ],
      );

      expect(result.matched).toEqual([
        { productId: 'p1', productName: 'Neveras', referenceName: 'Neveras', amountMn: 3000 },
      ]);
    });

    it('ignores accents and case, because the catalog is not typed consistently', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'LÁMPARA SOLAR')],
        [{ name: 'Lámpara solar', amountMn: 2000 }],
      );

      expect(result.matched[0]!.amountMn).toBe(2000);
    });

    it('lets the LONGEST matching key win — the specific beats the generic', () => {
      // The case the design calls out by name: a "Nevera 16 pies" must not be
      // priced as a plain nevera just because that key also appears in it.
      const result = buildCommissionAssignments(
        [product('p1', 'Neveras de 16 y 20 pies Frost')],
        [
          { name: 'Neveras', amountMn: 3000 },
          { name: 'Neveras de 16 y 20 pies', amountMn: 4000 },
        ],
      );

      expect(result.matched[0]!.amountMn).toBe(4000);
      expect(result.matched[0]!.referenceName).toBe('Neveras de 16 y 20 pies');
    });

    it('falls back to the generic key when the specific one does not appear', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Neveras Premium')],
        [
          { name: 'Neveras', amountMn: 3000 },
          { name: 'Neveras de 16 y 20 pies', amountMn: 4000 },
        ],
      );

      expect(result.matched[0]!.amountMn).toBe(3000);
    });

    it('writes NO row for a product nothing matches, instead of inventing one', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Cosa Rarísima')],
        [{ name: 'Neveras', amountMn: 3000 }],
      );

      expect(result.matched).toHaveLength(0);
      expect(result.unmatchedProducts).toEqual([{ id: 'p1', name: 'Cosa Rarísima' }]);
    });

    it('reports reference rows that matched no product, so stale data is visible', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Neveras')],
        [
          { name: 'Neveras', amountMn: 3000 },
          { name: 'Bici-moto', amountMn: 5000 },
        ],
      );

      expect(result.unusedReferences).toEqual(['Bici-moto']);
    });
  });

  describe('refusing to guess', () => {
    it('THROWS when two reference rows share a key but disagree on the amount', () => {
      // Nothing here can pick a winner honestly. Both are plausible, and
      // choosing either would set someone's pay by coin flip.
      expect(() =>
        buildCommissionAssignments(
          [product('p1', 'Split')],
          [
            { name: 'Split', amountMn: 3000 },
            { name: 'SPLIT', amountMn: 4500 },
          ],
        ),
      ).toThrow(/split/i);
    });

    it('accepts two rows that share a key and AGREE — no information is lost', () => {
      const result = buildCommissionAssignments(
        [product('p1', 'Split')],
        [
          { name: 'Split', amountMn: 3000 },
          { name: 'split', amountMn: 3000 },
        ],
      );

      expect(result.matched[0]!.amountMn).toBe(3000);
    });

    it('THROWS on a substring tie — two DIFFERENT keys of equal length, different amounts', () => {
      expect(() =>
        buildCommissionAssignments(
          // Both keys are 5 characters and both genuinely occur in the name,
          // so "longest wins" cannot break the tie.
          [product('p1', 'Combo silla y mesas de patio')],
          [
            { name: 'silla', amountMn: 1000 },
            { name: 'mesas', amountMn: 2000 },
          ],
        ),
      ).toThrow(/tie|ambiguous/i);
    });
  });
});
