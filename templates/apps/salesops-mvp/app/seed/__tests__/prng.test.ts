import { describe, expect, it } from 'vitest';
import { hashSeed, mulberry32 } from '../prng';

describe('hashSeed', () => {
  it('returns a fixed uint32 for "salesops-mvp-demo-v1"', () => {
    expect(hashSeed('salesops-mvp-demo-v1')).toBe(2699689555);
  });

  it('returns different hashes for different strings', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('always returns an unsigned 32-bit integer', () => {
    const hash = hashSeed('anything goes here');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('mulberry32', () => {
  it('produces the exact first-5 float sequence for a fixed seed (2699689555)', () => {
    const rng = mulberry32(2699689555);
    const values = Array.from({ length: 5 }, () => rng());
    expect(values).toEqual([
      0.0836511473171413,
      0.5429414755199105,
      0.655990696279332,
      0.25886355130933225,
      0.7709524906240404,
    ]);
  });

  it('produces the exact first-5 float sequence for seed 42', () => {
    const rng = mulberry32(42);
    const values = Array.from({ length: 5 }, () => rng());
    expect(values).toEqual([
      0.6011037519201636,
      0.44829055899754167,
      0.8524657934904099,
      0.6697340414393693,
      0.17481389874592423,
    ]);
  });

  it('is deterministic: two generators built from the same seed produce identical sequences', () => {
    const rngA = mulberry32(777);
    const rngB = mulberry32(777);
    const a = Array.from({ length: 10 }, () => rngA());
    const b = Array.from({ length: 10 }, () => rngB());
    expect(a).toEqual(b);
  });

  it('returns floats in the [0, 1) range', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
