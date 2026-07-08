import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY, VERSION } from '../../seed/constants';

describe('seed-store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('saveSeedState then loadSeedState returns a deep-equal SeedState', async () => {
    const { generateSeedState } = await import('../../seed/generate');
    const { saveSeedState, loadSeedState } = await import('../seed-store');

    const state = generateSeedState();
    saveSeedState(state);
    const loaded = loadSeedState();

    expect(loaded).toEqual(state);
  });

  it('regenerates and persists when the storage key is missing', async () => {
    const { loadSeedState } = await import('../seed-store');

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    const loaded = loadSeedState();

    expect(loaded.version).toBe(VERSION);
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(loaded);
  });

  it('regenerates and persists when the stored version does not match', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION - 1, stale: true }));
    const { loadSeedState } = await import('../seed-store');

    const loaded = loadSeedState();
    expect(loaded.version).toBe(VERSION);
    expect(loaded).not.toHaveProperty('stale');
  });

  it('resetDemo clears the key and regenerates a byte-identical SeedState', async () => {
    const { loadSeedState, resetDemo } = await import('../seed-store');

    const first = loadSeedState();
    const second = resetDemo();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
