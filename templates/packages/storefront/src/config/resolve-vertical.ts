import type { StoreVertical } from './types';

/** Vertical used when `VITE_STORE_VERTICAL` is unset or empty. */
export const DEFAULT_VERTICAL = 'clothes';

/**
 * Resolves the active `StoreVertical` from a static registry.
 *
 * - Missing/empty `verticalEnv` (env var unset) falls back to `defaultVertical`
 *   with no error — this is the documented default-vertical behavior.
 * - A non-empty `verticalEnv` that does not match any registry key throws a
 *   descriptive error naming the missing vertical — no silent fallback, so a
 *   typo'd `VITE_STORE_VERTICAL` fails the build clearly instead of quietly
 *   shipping the wrong storefront.
 */
export function resolveVertical(
  registry: Record<string, StoreVertical>,
  verticalEnv: string | undefined,
  defaultVertical: string = DEFAULT_VERTICAL,
): StoreVertical {
  const key = verticalEnv && verticalEnv.trim() !== '' ? verticalEnv : defaultVertical;
  const vertical = registry[key];

  if (!vertical) {
    throw new Error(
      `Unknown store vertical "${key}": no verticals/${key}/store.config.ts registered. ` +
        `Available verticals: ${Object.keys(registry).join(', ') || '(none registered)'}.`,
    );
  }

  return vertical;
}
