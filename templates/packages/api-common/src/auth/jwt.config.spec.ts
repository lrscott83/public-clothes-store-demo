/* eslint-disable turbo/no-undeclared-env-vars --
 * `SOME_SECRET` is not configuration: it is a deliberately fake variable NAME
 * passed as `resolveSecret`'s first argument, so the tests exercise the
 * resolution rule itself rather than any real secret. Declaring it in
 * `turbo.json` would advertise a config input that does not exist and would
 * add a phantom variable to turbo's cache key. The secrets this package
 * actually reads (`JWT_SECRET`, `REFRESH_TOKEN_SECRET`) are declared there.
 */
import { resolveSecret } from './jwt.config.js';

/**
 * SECURITY (FIX 2): a committed dev-fallback secret must NEVER be usable in
 * production — that would let anyone forge valid access/refresh JWTs by
 * reading the fallback string straight out of the repo. Outside production
 * (dev/test), the fallback keeps local runs and the test suite working
 * without requiring env vars to be set everywhere.
 */
describe('resolveSecret', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('throws in production when the env var is unset — no fallback allowed', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SOME_SECRET;

    expect(() => resolveSecret('SOME_SECRET', 'dev-fallback')).toThrow();
  });

  it('returns the env var value in production when it IS set', () => {
    process.env.NODE_ENV = 'production';
    process.env.SOME_SECRET = 'real-prod-secret';

    expect(resolveSecret('SOME_SECRET', 'dev-fallback')).toBe('real-prod-secret');
  });

  it('falls back to the dev value outside production when unset', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SOME_SECRET;

    expect(resolveSecret('SOME_SECRET', 'dev-fallback')).toBe('dev-fallback');
  });

  it('prefers the env var value over the fallback outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.SOME_SECRET = 'explicit-dev-secret';

    expect(resolveSecret('SOME_SECRET', 'dev-fallback')).toBe('explicit-dev-secret');
  });
});
