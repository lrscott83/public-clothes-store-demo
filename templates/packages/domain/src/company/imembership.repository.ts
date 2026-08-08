import type { CreateMembershipInput, Membership } from './models.js';

/**
 * Port for reading/writing master-schema `Membership` rows. Zero
 * dependency on any persistence technology — domain and application code
 * import this interface, never a concrete Prisma class.
 */
export interface IMembershipRepository {
  create(input: CreateMembershipInput): Promise<Membership>;
  findByUserAndCompany(userId: string, companyId: string): Promise<Membership | null>;
  /** Sole ACTIVE Membership for `userId` — the `TenantContextGuard` fallback (D4) when no `X-Company-Id` header is sent. */
  /**
   * EVERY ACTIVE membership for the user, not just one. The caller decides
   * what to do with more than one — the spec's header-less fallback is the
   * *sole* ACTIVE membership, so two or more is an ambiguous request, not a
   * pick-one situation. Returning a single row here (a `findFirst`) would
   * hide that ambiguity inside the repository and hand the caller an
   * arbitrary company as though it were the right one.
   */
  listActiveByUserId(userId: string): Promise<Membership[]>;
  listByCompany(companyId: string): Promise<Membership[]>;
  /** Provisioning saga step 4's compensation (design.md D7) — undoes `create` when a later step fails. */
  delete(id: string): Promise<void>;
}

/** DI token for `IMembershipRepository` — consumers inject by this symbol. */
export const MEMBERSHIP_REPOSITORY = Symbol('IMembershipRepository');
