/**
 * Tiny in-memory TTL cache. Lazy eviction (on read) — no background timer
 * required. Mirrors poolops-biz `packages/api-common/src/cache/ttl-cache.ts`.
 * Used to bound how often `JwtStrategy` re-resolves a `User` via
 * `IUserRepository.findById` on every authenticated request (ADR-2).
 *
 * NOT distributed. Each process/instance has its own cache. The `exp` claim
 * on the JWT itself is still checked BEFORE this cache is consulted (Passport
 * rejects expired tokens upstream), so this cache only bounds how soon a
 * user-account change (deactivation, role change) takes effect — the maximum
 * lag is `ttlMs`.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  delete(key: K): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Current entry count (includes possibly-expired entries — they're evicted on next get). */
  get size(): number {
    return this.entries.size;
  }
}
