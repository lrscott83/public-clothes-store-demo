import { describe, it, expect } from 'vitest';
import { createCompanyUser, createMembership } from './models.js';
import type { CompanyUser, Membership } from './models.js';
import { resolveTenantAccess } from './resolve-tenant-access.js';
import { InvalidCompanyUserError, InvalidMembershipError } from './errors.js';

describe('createCompanyUser — reshaped (D1), tenant-side, collapsed PK', () => {
  it('creates a CompanyUser with an explicit id (the master User.id)', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 1 });
    expect(companyUser.id).toBe('user-1');
    expect(companyUser.role).toBe(1);
  });

  it('requires an explicit id — never auto-generated', () => {
    expect(() => createCompanyUser({ id: '', role: 1 })).toThrow(InvalidCompanyUserError);
  });

  it('rejects a whitespace-only id', () => {
    expect(() => createCompanyUser({ id: '   ', role: 1 })).toThrow(InvalidCompanyUserError);
  });

  it('rejects a negative role', () => {
    expect(() => createCompanyUser({ id: 'user-1', role: -1 })).toThrow(InvalidCompanyUserError);
  });

  it('rejects a non-integer role', () => {
    expect(() => createCompanyUser({ id: 'user-1', role: 1.5 })).toThrow(InvalidCompanyUserError);
  });

  it('accepts a zero role (valid zero-permission state)', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 0 });
    expect(companyUser.role).toBe(0);
  });

  it('defaults createdByCompanyUserId to null — nobody provisioned a signup or a seed', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 1 });
    expect(companyUser.createdByCompanyUserId).toBeNull();
  });

  it('keeps an explicit createdByCompanyUserId — the provisioning audit trail', () => {
    const companyUser = createCompanyUser({
      id: 'user-1',
      role: 1,
      createdByCompanyUserId: 'company-user-creator',
    });
    expect(companyUser.createdByCompanyUserId).toBe('company-user-creator');
  });

  it('carries no userId field — company identity is the schema, not a column', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 1 });
    expect('userId' in companyUser).toBe(false);
  });

  it('carries no companyId field — company identity is the schema, not a column', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 1 });
    expect('companyId' in companyUser).toBe(false);
  });

  it('carries no status/isActive field — status lives only on Membership', () => {
    const companyUser = createCompanyUser({ id: 'user-1', role: 1 });
    expect('status' in companyUser).toBe(false);
    expect('isActive' in companyUser).toBe(false);
  });
});

describe('createMembership — master-side (userId, companyId, status)', () => {
  it('creates a Membership with ACTIVE status by default', () => {
    const membership = createMembership({ userId: 'user-1', companyId: 'company-1' });
    expect(membership.status).toBe('ACTIVE');
  });

  it('accepts an explicit REVOKED status', () => {
    const membership = createMembership({ userId: 'user-1', companyId: 'company-1', status: 'REVOKED' });
    expect(membership.status).toBe('REVOKED');
  });

  it('accepts an explicit SUSPENDED status', () => {
    const membership = createMembership({ userId: 'user-1', companyId: 'company-1', status: 'SUSPENDED' });
    expect(membership.status).toBe('SUSPENDED');
  });

  it('rejects a missing userId', () => {
    expect(() => createMembership({ userId: '', companyId: 'company-1' })).toThrow(InvalidMembershipError);
  });

  it('rejects a whitespace-only userId', () => {
    expect(() => createMembership({ userId: '   ', companyId: 'company-1' })).toThrow(InvalidMembershipError);
  });

  it('rejects a missing companyId', () => {
    expect(() => createMembership({ userId: 'user-1', companyId: '' })).toThrow(InvalidMembershipError);
  });

  it('rejects a whitespace-only companyId', () => {
    expect(() => createMembership({ userId: 'user-1', companyId: '   ' })).toThrow(InvalidMembershipError);
  });

  it('mints an id when none is given', () => {
    const membership = createMembership({ userId: 'user-1', companyId: 'company-1' });
    expect(typeof membership.id).toBe('string');
    expect(membership.id.length).toBeGreaterThan(0);
  });

  it('keeps an explicit id', () => {
    const membership = createMembership({ userId: 'user-1', companyId: 'company-1', id: 'membership-1' });
    expect(membership.id).toBe('membership-1');
  });
});

describe('resolveTenantAccess — ACTIVE Membership + tenant CompanyUser gates access', () => {
  function makeMembership(overrides: Partial<Membership> = {}): Membership {
    const now = new Date();
    return {
      id: 'membership-1',
      userId: 'user-1',
      companyId: 'company-1',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  function makeCompanyUser(overrides: Partial<CompanyUser> = {}): CompanyUser {
    const now = new Date();
    return {
      id: 'user-1',
      role: 1,
      createdByCompanyUserId: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('grants access with an ACTIVE Membership and a resolved tenant CompanyUser', () => {
    const result = resolveTenantAccess({ membership: makeMembership(), companyUser: makeCompanyUser() });
    expect(result.granted).toBe(true);
  });

  it('denies access when no Membership exists', () => {
    const result = resolveTenantAccess({ membership: null, companyUser: makeCompanyUser() });
    expect(result.granted).toBe(false);
  });

  it('denies access when Membership status is REVOKED', () => {
    const result = resolveTenantAccess({
      membership: makeMembership({ status: 'REVOKED' }),
      companyUser: makeCompanyUser(),
    });
    expect(result.granted).toBe(false);
  });

  it('denies access when Membership status is SUSPENDED', () => {
    const result = resolveTenantAccess({
      membership: makeMembership({ status: 'SUSPENDED' }),
      companyUser: makeCompanyUser(),
    });
    expect(result.granted).toBe(false);
  });

  it('denies access when the Membership is ACTIVE but no tenant CompanyUser resolves (orphaned grant)', () => {
    const result = resolveTenantAccess({ membership: makeMembership(), companyUser: null });
    expect(result.granted).toBe(false);
  });
});
