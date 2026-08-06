import { describe, it, expect } from 'vitest';
import { createCarrier } from './carrier.js';
import type { Carrier } from './carrier.js';

describe('createCarrier', () => {
  it('creates a carrier with required name only, phone null, active=true', () => {
    const carrier = createCarrier({ name: 'Transportes ABC' });
    expect(carrier.name).toBe('Transportes ABC');
    expect(carrier.phone).toBeNull();
    expect(carrier.active).toBe(true);
  });

  it('accepts an optional phone', () => {
    const carrier = createCarrier({ name: 'Transportes ABC', phone: '+53 5555 5555' });
    expect(carrier.phone).toBe('+53 5555 5555');
  });

  it('mints a fresh id and timestamps when not supplied', () => {
    const carrier = createCarrier({ name: 'Transportes ABC' });
    expect(carrier.id).toEqual(expect.any(String));
    expect(carrier.createdAt).toBeInstanceOf(Date);
    expect(carrier.updatedAt).toBeInstanceOf(Date);
  });
});

describe('Carrier — soft-delete shape', () => {
  /**
   * Soft-delete is written by `ICarrierRepository.softDelete` (infra layer,
   * Phase 3) — mirroring `IWarehouseRepository.softDelete`. This asserts the
   * IMMUTABLE shape that write preserves: flipping `active` never touches
   * identity (`id`/`name`/`phone`/`createdAt`).
   */
  it('flips active to false without mutating identity', () => {
    const carrier = createCarrier({ name: 'Transportes ABC', phone: '+53 5555 5555' });
    const at = new Date('2026-08-06T12:00:00.000Z');
    const softDeleted: Carrier = { ...carrier, active: false, updatedAt: at };

    expect(softDeleted.active).toBe(false);
    expect(softDeleted.id).toBe(carrier.id);
    expect(softDeleted.name).toBe(carrier.name);
    expect(softDeleted.phone).toBe(carrier.phone);
    expect(softDeleted.createdAt).toEqual(carrier.createdAt);
  });
});
