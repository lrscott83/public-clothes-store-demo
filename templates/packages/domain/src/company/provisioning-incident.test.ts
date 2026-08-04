import { describe, it, expect } from 'vitest';
import { createProvisioningIncident } from './provisioning-incident.js';
import { InvalidProvisioningIncidentError } from './errors.js';

describe('createProvisioningIncident — master-schema saga compensation record (design D7)', () => {
  it('creates a ProvisioningIncident with a generated id and null resolvedAt by default', () => {
    const incident = createProvisioningIncident({
      companyId: 'company-1',
      step: 'create-schema-rollback',
      reason: 'DROP SCHEMA timed out',
    });

    expect(incident.id).toEqual(expect.any(String));
    expect(incident.companyId).toBe('company-1');
    expect(incident.step).toBe('create-schema-rollback');
    expect(incident.reason).toBe('DROP SCHEMA timed out');
    expect(incident.resolvedAt).toBeNull();
    expect(incident.createdAt).toBeInstanceOf(Date);
  });

  it('keeps an explicit id, resolvedAt and createdAt when provided', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const resolvedAt = new Date('2026-01-02T00:00:00Z');
    const incident = createProvisioningIncident({
      id: 'incident-1',
      companyId: 'company-1',
      step: 'membership-rollback',
      reason: 'FK violation',
      resolvedAt,
      createdAt,
    });

    expect(incident.id).toBe('incident-1');
    expect(incident.resolvedAt).toBe(resolvedAt);
    expect(incident.createdAt).toBe(createdAt);
  });

  it('rejects an empty companyId', () => {
    expect(() =>
      createProvisioningIncident({ companyId: '', step: 'x', reason: 'y' }),
    ).toThrow(InvalidProvisioningIncidentError);
  });

  it('rejects a whitespace-only companyId', () => {
    expect(() =>
      createProvisioningIncident({ companyId: '   ', step: 'x', reason: 'y' }),
    ).toThrow(InvalidProvisioningIncidentError);
  });

  it('rejects an empty step', () => {
    expect(() =>
      createProvisioningIncident({ companyId: 'company-1', step: '', reason: 'y' }),
    ).toThrow(InvalidProvisioningIncidentError);
  });

  it('rejects an empty reason', () => {
    expect(() =>
      createProvisioningIncident({ companyId: 'company-1', step: 'x', reason: '' }),
    ).toThrow(InvalidProvisioningIncidentError);
  });
});
