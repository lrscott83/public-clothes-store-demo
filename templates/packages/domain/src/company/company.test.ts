import { describe, it, expect } from 'vitest';
import { createCompany } from './company.js';
import { InvalidCompanyError } from './errors.js';

describe('createCompany — provisioning saga step 1 (design D7)', () => {
  it('creates a Company with a generated id, isActive=true, and schemaName NULL', () => {
    const company = createCompany({ name: 'Tienda Nueva', slug: 'tienda-nueva' });

    expect(company.id).toEqual(expect.any(String));
    expect(company.name).toBe('Tienda Nueva');
    expect(company.slug).toBe('tienda-nueva');
    expect(company.isActive).toBe(true);
    expect(company.schemaName).toBeNull();
    expect(company.createdAt).toBeInstanceOf(Date);
    expect(company.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects an empty name', () => {
    expect(() => createCompany({ name: '', slug: 'x' })).toThrow(InvalidCompanyError);
  });

  it('rejects a whitespace-only name', () => {
    expect(() => createCompany({ name: '   ', slug: 'x' })).toThrow(InvalidCompanyError);
  });

  it('rejects an empty slug', () => {
    expect(() => createCompany({ name: 'x', slug: '' })).toThrow(InvalidCompanyError);
  });

  it('rejects a whitespace-only slug', () => {
    expect(() => createCompany({ name: 'x', slug: '   ' })).toThrow(InvalidCompanyError);
  });
});
