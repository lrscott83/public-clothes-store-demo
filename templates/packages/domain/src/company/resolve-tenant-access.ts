import type { CompanyUser, Membership } from './models.js';

export interface ResolveTenantAccessInput {
  readonly membership: Membership | null;
  readonly companyUser: CompanyUser | null;
}

export type TenantAccessResult =
  | { readonly granted: true }
  | { readonly granted: false; readonly reason: string };

/**
 * PURE domain policy (design D4): does this `(Membership, tenant
 * CompanyUser)` pair get access to the tenant schema? Access requires BOTH
 * an ACTIVE `Membership` AND a resolved tenant `CompanyUser` — a missing or
 * non-ACTIVE `Membership` is denied identically to a missing one (spec:
 * "Membership Status Gates Company Access"), and an ACTIVE `Membership`
 * with no matching tenant `CompanyUser` (an orphaned grant — e.g. a failed
 * provisioning compensation) is ALSO denied, since the tenant row is the
 * actual proof the assignment was provisioned. No I/O here — callers
 * (`TenantContextGuard`, Phase 7) resolve both rows first and pass them
 * in, keeping this fn trivially unit-testable.
 */
export function resolveTenantAccess(input: ResolveTenantAccessInput): TenantAccessResult {
  if (input.membership === null) {
    return { granted: false, reason: 'No Membership exists for this (user, company) pair' };
  }
  if (input.membership.status !== 'ACTIVE') {
    return { granted: false, reason: `Membership status is ${input.membership.status}, not ACTIVE` };
  }
  if (input.companyUser === null) {
    return { granted: false, reason: 'No tenant CompanyUser exists for this Membership' };
  }
  return { granted: true };
}
