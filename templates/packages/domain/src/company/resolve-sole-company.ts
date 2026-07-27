import type { Company } from './company.js';
import { AmbiguousCompanyError, NoCompanyConfiguredError } from './errors.js';

/**
 * PURE domain policy (design.md A2): given every known `Company`, resolve
 * the ONE a brand-new signup gets auto-assigned to. NEVER silently defaults
 * — zero Companies is a misconfigured deployment (`NoCompanyConfiguredError`),
 * more than one is unreachable today and forces the future Invitation flow
 * to be designed deliberately (`AmbiguousCompanyError`). No DB access here —
 * callers pass in the already-loaded list (e.g.
 * `companyRepository.list()`), keeping this fn trivially unit-testable.
 */
export function resolveSoleCompany(companies: readonly Company[]): Company {
  if (companies.length === 0) {
    throw new NoCompanyConfiguredError('No Company is configured — cannot auto-assign a new signup');
  }
  if (companies.length > 1) {
    throw new AmbiguousCompanyError(
      `Cannot auto-assign: ${companies.length} Companies exist, expected exactly one`,
    );
  }
  return companies[0];
}
