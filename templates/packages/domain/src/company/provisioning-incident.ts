import { randomUUID } from 'node:crypto';
import { InvalidProvisioningIncidentError } from './errors.js';

/**
 * `ProvisioningIncident` — master-schema record of a failed compensation
 * step during the provisioning saga (design.md D7). "A failing compensation
 * step is not trusted": rather than silently swallow the error, the saga
 * writes one of these, and `scripts/tenant-orphan-sweep.ts` (Phase 10.3,
 * out of scope for this task) later finds and reports it. Never has a `@relation`
 * to `Company` — a compensation failure can legitimately outlive the
 * `Company` row it is about (e.g. the `Company` delete itself is what
 * failed), so a hard FK would make exactly the case this exists to record
 * unrepresentable.
 */
export interface ProvisioningIncident {
  readonly id: string;
  readonly companyId: string;
  /** Which saga step's compensation failed, e.g. "create-schema-rollback" — free text, read by a human operator. */
  readonly step: string;
  readonly reason: string;
  readonly resolvedAt: Date | null;
  readonly createdAt: Date;
}

/**
 * Input to `createProvisioningIncident`. `id`/`createdAt` are optional so
 * the factory can mint a brand-new incident (defaults applied).
 */
export interface CreateProvisioningIncidentInput {
  readonly id?: string;
  readonly companyId: string;
  readonly step: string;
  readonly reason: string;
  readonly resolvedAt?: Date | null;
  readonly createdAt?: Date;
}

/**
 * Validates and constructs a `ProvisioningIncident`. Enforces non-empty,
 * non-whitespace `companyId`, `step`, and `reason` — an incident with a
 * blank reason is worse than no record at all, since the sweep tool has
 * nothing to report. Throws `InvalidProvisioningIncidentError` — never
 * silently accepts invalid input.
 */
export function createProvisioningIncident(
  input: CreateProvisioningIncidentInput,
): ProvisioningIncident {
  if (!input.companyId || input.companyId.trim().length === 0) {
    throw new InvalidProvisioningIncidentError(
      'ProvisioningIncident companyId must not be empty or whitespace-only',
    );
  }
  if (!input.step || input.step.trim().length === 0) {
    throw new InvalidProvisioningIncidentError(
      'ProvisioningIncident step must not be empty or whitespace-only',
    );
  }
  if (!input.reason || input.reason.trim().length === 0) {
    throw new InvalidProvisioningIncidentError(
      'ProvisioningIncident reason must not be empty or whitespace-only',
    );
  }

  return {
    id: input.id ?? randomUUID(),
    companyId: input.companyId,
    step: input.step,
    reason: input.reason,
    resolvedAt: input.resolvedAt ?? null,
    createdAt: input.createdAt ?? new Date(),
  };
}
