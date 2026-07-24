import { TtlCache } from './ttl-cache.js';

describe('TtlCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the cached value within the TTL window', () => {
    const cache = new TtlCache<string, number>(1_000);
    cache.set('a', 42);

    expect(cache.get('a')).toBe(42);
  });

  it('returns undefined for a key that was never set', () => {
    const cache = new TtlCache<string, number>(1_000);

    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires an entry once ttlMs has elapsed', () => {
    jest.useFakeTimers();
    const cache = new TtlCache<string, number>(1_000);
    cache.set('a', 42);

    jest.advanceTimersByTime(1_001);

    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the expired entry on read (size drops after a stale get)', () => {
    jest.useFakeTimers();
    const cache = new TtlCache<string, number>(1_000);
    cache.set('a', 42);

    jest.advanceTimersByTime(1_001);
    cache.get('a');

    expect(cache.size).toBe(0);
  });

  it('delete removes a single key without touching the rest', () => {
    const cache = new TtlCache<string, number>(1_000);
    cache.set('a', 1);
    cache.set('b', 2);

    cache.delete('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('clear empties every entry', () => {
    const cache = new TtlCache<string, number>(1_000);
    cache.set('a', 1);
    cache.set('b', 2);

    cache.clear();

    expect(cache.size).toBe(0);
  });
});
