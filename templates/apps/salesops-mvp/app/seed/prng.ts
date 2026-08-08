/**
 * Deterministic pseudo-random utilities for the seed generator.
 *
 * Never call the wall-clock or non-deterministic RNG globals anywhere in
 * `app/seed/` — the whole point of this module is byte-identical output
 * across runs (see `app/seed/constants.ts` and `app/seed/generate.ts`).
 */

/** mulberry32 — small, fast, well-known deterministic PRNG (public domain). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit hash — turns an arbitrary string seed into a uint32. */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
