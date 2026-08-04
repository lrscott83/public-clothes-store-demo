/**
 * Named domain errors for the Companies module. Guards throw these
 * explicitly instead of silently defaulting/guessing — "grita, no adivina"
 * (scream, not guess), matching the Users/Customer/Sales modules' error
 * discipline.
 */

/** Thrown by `resolveSoleCompany` when zero `Company` rows exist — a misconfigured deployment. */
export class NoCompanyConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoCompanyConfiguredError';
  }
}

/** Thrown by `resolveSoleCompany` when more than one `Company` row exists — today unreachable, forces the future Invitation flow to be designed deliberately. */
export class AmbiguousCompanyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousCompanyError';
  }
}

/**
 * Thrown when an authenticated `User` has no ACTIVE `CompanyUser` row (or
 * the row is REVOKED/SUSPENDED). Distinct from a silent `roles: 0` — the
 * caller is authenticated but not provisioned. Consumed by `JwtStrategy` in
 * the Phase 2 behavioral cutover; declared now so Phase 2 has zero new
 * error-type churn.
 */
export class MissingCompanyUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingCompanyUserError';
  }
}

/** Thrown when `createCompanyUser` input violates an invariant (role/id). */
export class InvalidCompanyUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCompanyUserError';
  }
}

/** Thrown when `createMembership` input violates an invariant (userId/companyId). */
export class InvalidMembershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMembershipError';
  }
}

/** Thrown when `createProvisioningIncident` input violates an invariant (companyId/step/reason). */
export class InvalidProvisioningIncidentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProvisioningIncidentError';
  }
}
