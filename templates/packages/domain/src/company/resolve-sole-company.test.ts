import { describe, it, expect } from 'vitest';
import { resolveSoleCompany } from './resolve-sole-company.js';
import { NoCompanyConfiguredError, AmbiguousCompanyError } from './errors.js';
import type { Company } from './company.js';

function makeCompany(overrides: Partial<Company> = {}): Company {
  const now = new Date();
  return {
    id: 'company-1',
    name: 'Tienda Principal',
    slug: 'default',
    isActive: true,
    schemaName: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('resolveSoleCompany', () => {
  it('returns the sole Company when exactly one exists', () => {
    const company = makeCompany();

    const resolved = resolveSoleCompany([company]);

    expect(resolved).toBe(company);
  });

  it('throws NoCompanyConfiguredError when zero Companies exist', () => {
    expect(() => resolveSoleCompany([])).toThrow(NoCompanyConfiguredError);
  });

  it('throws AmbiguousCompanyError when more than one Company exists', () => {
    const companies = [makeCompany({ id: 'company-1' }), makeCompany({ id: 'company-2', slug: 'second' })];

    expect(() => resolveSoleCompany(companies)).toThrow(AmbiguousCompanyError);
  });
});
