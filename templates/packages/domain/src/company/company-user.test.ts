import { describe, it, expect } from 'vitest';
import { createCompanyUser } from './company-user.js';
import { InvalidCompanyUserError } from './errors.js';

describe('createCompanyUser — invariants', () => {
  it('creates a CompanyUser with a non-negative int role', () => {
    const companyUser = createCompanyUser({ userId: 'user-1', companyId: 'company-1', role: 1 });
    expect(companyUser.role).toBe(1);
  });

  it('defaults status to ACTIVE', () => {
    const companyUser = createCompanyUser({ userId: 'user-1', companyId: 'company-1', role: 1 });
    expect(companyUser.status).toBe('ACTIVE');
  });

  it('accepts an explicit non-ACTIVE status', () => {
    const companyUser = createCompanyUser({
      userId: 'user-1',
      companyId: 'company-1',
      role: 1,
      status: 'REVOKED',
    });
    expect(companyUser.status).toBe('REVOKED');
  });

  it('rejects a missing userId', () => {
    expect(() => createCompanyUser({ userId: '', companyId: 'company-1', role: 1 })).toThrow(
      InvalidCompanyUserError,
    );
  });

  it('rejects a whitespace-only userId', () => {
    expect(() => createCompanyUser({ userId: '   ', companyId: 'company-1', role: 1 })).toThrow(
      InvalidCompanyUserError,
    );
  });

  it('rejects a missing companyId', () => {
    expect(() => createCompanyUser({ userId: 'user-1', companyId: '', role: 1 })).toThrow(
      InvalidCompanyUserError,
    );
  });

  it('rejects a negative role', () => {
    expect(() => createCompanyUser({ userId: 'user-1', companyId: 'company-1', role: -1 })).toThrow(
      InvalidCompanyUserError,
    );
  });

  it('rejects a non-integer role', () => {
    expect(() => createCompanyUser({ userId: 'user-1', companyId: 'company-1', role: 1.5 })).toThrow(
      InvalidCompanyUserError,
    );
  });

  it('accepts a zero role (valid zero-permission state)', () => {
    const companyUser = createCompanyUser({ userId: 'user-1', companyId: 'company-1', role: 0 });
    expect(companyUser.role).toBe(0);
  });
});
