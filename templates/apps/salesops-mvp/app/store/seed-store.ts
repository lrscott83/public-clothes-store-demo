import type { SeedState } from '../domain/types';
import { generateSeedState } from '../seed/generate';
import { STORAGE_KEY, VERSION } from '../seed/constants';

export { STORAGE_KEY, VERSION };

/** Persists the full SeedState under the versioned localStorage key. */
export function saveSeedState(state: SeedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function readStoredState(): SeedState | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SeedState;
    if (parsed.version !== VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Loads the persisted SeedState. If the key is missing or its `version`
 * doesn't match the current one, regenerates a fresh SeedState and persists
 * it under the current version before returning it.
 */
export function loadSeedState(): SeedState {
  const stored = readStoredState();
  if (stored) return stored;

  const fresh = generateSeedState();
  saveSeedState(fresh);
  return fresh;
}

/**
 * Clears the storage key and regenerates. Since `generateSeedState()` is
 * pure (fixed SEED/ANCHOR_ISO), the result is byte-identical to the very
 * first run.
 */
export function resetDemo(): SeedState {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = generateSeedState();
  saveSeedState(fresh);
  return fresh;
}
