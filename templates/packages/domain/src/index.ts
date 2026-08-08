export * from './models/base.js';
export * from './models/store.js';
export * from './models/inventory.js';
export * from './models/expense.js';
export * from './enums/index.js';
export * from './currency/index.js';
export * from './product/index.js';
export * from './inventory/index.js';
export * from './customer/index.js';
export * from './sales/index.js';
export * from './users/index.js';
export * from './company/index.js';
export * from './commission/index.js';
export * from './delivery/index.js';
// The two concurrency/time failures a repository port is allowed to report.
// Introduced with the explicit row locking: a deadlock (`40P01`) and a blown
// transaction budget (`P2028`) were both untranslated 500s, i.e. the locking
// added to stop one class of 500 produced another. See the module's doc.
export {
  ConcurrentWriteConflictError,
  PersistenceTimeoutError,
} from './persistence/errors.js';

// Multi-tenant-by-schema (design D1): reshaped `CompanyUser`, `Membership`,
// and the `resolveTenantAccess` policy now export as plain names through
// `company/index.js`'s wildcard above — task 14.3 collapsed the temporary
// `TenantCompanyUser`/`createTenantCompanyUser`/`CreateTenantCompanyUserInput`
// aliases (Phase 1, commit `f376942`) once Phases 6/7/8/10 retired every
// consumer of the pre-reshape `CompanyUser` that used to collide with this
// name through the same wildcard.

// Task 3.4 (WU3b): `ProvisioningIncident` (design D7) — same "export
// directly here, not through `company/index.js`" precedent as the block
// above, kept together since both are master-schema, multi-tenant-by-schema
// additions.
export type {
  ProvisioningIncident,
  CreateProvisioningIncidentInput,
} from './company/provisioning-incident.js';
export { createProvisioningIncident } from './company/provisioning-incident.js';
export type { IProvisioningIncidentRepository } from './company/iprovisioning-incident.repository.js';
export { PROVISIONING_INCIDENT_REPOSITORY } from './company/iprovisioning-incident.repository.js';
export { InvalidProvisioningIncidentError } from './company/errors.js';
