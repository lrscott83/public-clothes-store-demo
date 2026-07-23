import { describe, it, expect } from 'vitest';
import { RoleHelpers, USER_ROLES, effectiveRoles, can } from './roles.js';

describe('RoleHelpers — bit ops', () => {
  it('hasRole checks a single bit', () => {
    const roles = USER_ROLES.warehouse_operator | USER_ROLES.owner;
    expect(RoleHelpers.hasRole(roles, USER_ROLES.owner)).toBe(true);
    expect(RoleHelpers.hasRole(roles, USER_ROLES.admin)).toBe(false);
  });

  it('a user can hold multiple roles at once — addRole does not evict others', () => {
    let roles: number = USER_ROLES.warehouse_operator;
    roles = RoleHelpers.addRole(roles, USER_ROLES.sales_operator);
    expect(RoleHelpers.hasRole(roles, USER_ROLES.warehouse_operator)).toBe(true);
    expect(RoleHelpers.hasRole(roles, USER_ROLES.sales_operator)).toBe(true);
    expect(RoleHelpers.getRoles(roles).sort()).toEqual(
      [USER_ROLES.warehouse_operator, USER_ROLES.sales_operator].sort(),
    );
  });

  it('removeRole clears only the targeted bit', () => {
    const roles = USER_ROLES.warehouse_operator | USER_ROLES.owner;
    const cleared = RoleHelpers.removeRole(roles, USER_ROLES.warehouse_operator);
    expect(RoleHelpers.hasRole(cleared, USER_ROLES.warehouse_operator)).toBe(false);
    expect(RoleHelpers.hasRole(cleared, USER_ROLES.owner)).toBe(true);
  });

  it('getRoleLabel returns the Spanish display label for a role KEY (keys stay English)', () => {
    expect(RoleHelpers.getRoleLabel('warehouse_operator')).toBe('Operador de almacén');
    expect(RoleHelpers.getRoleLabel('sales_operator')).toBe('Operador de gestores');
    expect(RoleHelpers.getRoleLabel('owner')).toBe('Dueño');
    expect(RoleHelpers.getRoleLabel('admin')).toBe('Administrador');
    expect(RoleHelpers.getRoleLabel('user')).toBe('Cliente');
  });

  it('getRoleLabels returns Spanish labels for every bit held by roles', () => {
    const roles = USER_ROLES.warehouse_operator | USER_ROLES.sales_operator;
    expect(RoleHelpers.getRoleLabels(roles).sort()).toEqual(
      ['Operador de almacén', 'Operador de gestores'].sort(),
    );
  });
});

describe('effectiveRoles / can — permission union + super-root precedence', () => {
  it('admin returns the union of ALL bits (system super-root)', () => {
    const allBits = Object.values(USER_ROLES).reduce((acc, bit) => acc | bit, 0);
    expect(effectiveRoles(USER_ROLES.admin)).toBe(allBits);
  });

  it('owner returns union of business bits, NOT admin', () => {
    const businessBits =
      USER_ROLES.user | USER_ROLES.warehouse_operator | USER_ROLES.sales_operator | USER_ROLES.owner;
    expect(effectiveRoles(USER_ROLES.owner)).toBe(businessBits);
    expect(RoleHelpers.hasRole(effectiveRoles(USER_ROLES.owner), USER_ROLES.admin)).toBe(false);
  });

  it('a plain role (no admin/owner) resolves unchanged', () => {
    expect(effectiveRoles(USER_ROLES.warehouse_operator)).toBe(USER_ROLES.warehouse_operator);
  });

  it('can() grants when holding ANY required role — union semantics', () => {
    const roles = USER_ROLES.warehouse_operator | USER_ROLES.sales_operator;
    expect(can(roles, USER_ROLES.warehouse_operator)).toBe(true);
    expect(can(roles, USER_ROLES.sales_operator)).toBe(true);
    expect(can(roles, USER_ROLES.owner)).toBe(false);
  });

  it('admin passes every role gate', () => {
    expect(can(USER_ROLES.admin, USER_ROLES.owner)).toBe(true);
    expect(can(USER_ROLES.admin, USER_ROLES.warehouse_operator)).toBe(true);
  });

  it('owner passes a business-role check via union', () => {
    expect(can(USER_ROLES.owner, USER_ROLES.warehouse_operator)).toBe(true);
  });

  it('a user holding only "user" fails an owner-required check', () => {
    expect(can(USER_ROLES.user, USER_ROLES.owner)).toBe(false);
  });
});
