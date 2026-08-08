import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSeedState } from '../generate';
import { ANCHOR_ISO } from '../constants';

describe('generateSeedState — determinism', () => {
  it('produces byte-identical output across two in-process calls', () => {
    const a = generateSeedState();
    const b = generateSeedState();

    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('sets generatedAt to the frozen ANCHOR_ISO constant, never the wall clock', () => {
    const state = generateSeedState();
    expect(state.generatedAt).toBe(ANCHOR_ISO);
    expect(ANCHOR_ISO).toBe('2026-07-10T12:00:00.000Z');
  });
});

describe('generate.ts / seed/*.ts — no non-deterministic globals (static guard)', () => {
  it('never references the wall clock or a non-deterministic RNG in app/seed source', () => {
    const seedDir = resolve(process.cwd(), 'app/seed');
    const files = readdirSync(seedDir).filter((f) => f.endsWith('.ts'));

    for (const file of files) {
      const source = readFileSync(resolve(seedDir, file), 'utf-8');
      expect(source, `${file} must not call Date.now(`).not.toMatch(/Date\.now\(/);
      expect(source, `${file} must not call Math.random(`).not.toMatch(/Math\.random\(/);
    }
  });
});
