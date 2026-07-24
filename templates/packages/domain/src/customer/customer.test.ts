import { describe, it, expect } from 'vitest';
import { createCustomer } from './customer.js';
import { InvalidCustomerError } from './errors.js';

const USER_ID = 'user-uuid-1';

describe('createCustomer — invariants', () => {
  it('rejects an empty fullName', () => {
    expect(() => createCustomer({ fullName: '', userId: USER_ID })).toThrow(InvalidCustomerError);
  });

  it('rejects a whitespace-only fullName', () => {
    expect(() => createCustomer({ fullName: '   ', userId: USER_ID })).toThrow(InvalidCustomerError);
  });

  it('rejects a missing userId', () => {
    expect(() => createCustomer({ fullName: 'Ana Torres', userId: '' })).toThrow(InvalidCustomerError);
  });

  it('rejects a whitespace-only userId', () => {
    expect(() => createCustomer({ fullName: 'Ana Torres', userId: '   ' })).toThrow(InvalidCustomerError);
  });

  it('accepts a valid fullName and defaults active=true', () => {
    const customer = createCustomer({ fullName: 'Ana Torres', userId: USER_ID });
    expect(customer.fullName).toBe('Ana Torres');
    expect(customer.userId).toBe(USER_ID);
    expect(customer.active).toBe(true);
  });

  it('resolves every absent contact field to null', () => {
    const customer = createCustomer({ fullName: 'Ana Torres', userId: USER_ID });
    expect(customer.documentId).toBeNull();
    expect(customer.cellPhone).toBeNull();
    expect(customer.email).toBeNull();
    expect(customer.address).toBeNull();
    expect(customer.note).toBeNull();
  });

  it('produces a Customer with a single fullName field, no firstName/lastName split', () => {
    const customer = createCustomer({ fullName: 'Ana Torres', userId: USER_ID });
    expect(Object.keys(customer)).not.toContain('firstName');
    expect(Object.keys(customer)).not.toContain('lastName');
  });

  it('produces a Customer with no money field', () => {
    const customer = createCustomer({ fullName: 'Ana Torres', userId: USER_ID });
    expect(Object.keys(customer)).not.toContain('creditLimit');
    expect(Object.keys(customer)).not.toContain('balance');
    expect(Object.keys(customer)).not.toContain('debt');
  });
});
