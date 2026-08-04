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

// Multi-tenant-by-schema (design D1): reshaped `CompanyUser`, `Membership`,
// and the `resolveTenantAccess` policy. Exported directly here — NOT
// through `company/index.js` — because their `CompanyUser` name collides
// with the pre-reshape `CompanyUser` still exported by `company/index.js`
// for existing consumers until Phase 6/7/10 retire it.
export type {
  CompanyUser as TenantCompanyUser,
  CreateCompanyUserInput as CreateTenantCompanyUserInput,
  Membership,
  MembershipStatus,
  CreateMembershipInput,
} from './company/models.js';
export { createCompanyUser as createTenantCompanyUser, createMembership } from './company/models.js';
export type { IMembershipRepository } from './company/imembership.repository.js';
export { MEMBERSHIP_REPOSITORY } from './company/imembership.repository.js';
export type { ResolveTenantAccessInput, TenantAccessResult } from './company/resolve-tenant-access.js';
export { resolveTenantAccess } from './company/resolve-tenant-access.js';
export { InvalidMembershipError } from './company/errors.js';
