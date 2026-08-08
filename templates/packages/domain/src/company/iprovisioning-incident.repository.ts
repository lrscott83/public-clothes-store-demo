import type { CreateProvisioningIncidentInput, ProvisioningIncident } from './provisioning-incident.js';

/**
 * Port for reading/writing master-schema `ProvisioningIncident` rows. Zero
 * dependency on any persistence technology — domain and application code
 * import this interface, never a concrete Prisma class.
 */
export interface IProvisioningIncidentRepository {
  create(input: CreateProvisioningIncidentInput): Promise<ProvisioningIncident>;
  /** Incidents `scripts/tenant-orphan-sweep.ts` (Phase 10.3) still needs to reconcile. */
  listUnresolved(): Promise<ProvisioningIncident[]>;
}

/** DI token for `IProvisioningIncidentRepository` — consumers inject by this symbol. */
export const PROVISIONING_INCIDENT_REPOSITORY = Symbol('IProvisioningIncidentRepository');
