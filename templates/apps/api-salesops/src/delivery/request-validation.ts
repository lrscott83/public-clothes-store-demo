import { BadRequestException } from '@nestjs/common';

/**
 * Boundary assertions for the Delivery endpoints.
 *
 * This app installs NO global `ValidationPipe`, and its DTO classes are
 * erased at runtime — `@Body() body: CreateCarrierDto` is a compile-time
 * claim, not a check (stated in-code at `sales/order.controller.ts`'s
 * `create`). Every sibling controller therefore hand-validates at the
 * boundary; Delivery validated nothing, so `POST /delivery/carriers {}`
 * reached Prisma with `name: undefined` and came back a 500 instead of a 400.
 *
 * These live in one file rather than being copied into both Delivery
 * controllers, for the same reason `../auth/role-scope.ts` exists.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects `undefined`, a non-string, and a string that is empty once trimmed. */
export function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
}

/** Same, but tolerates an absent value — for PATCH bodies where every field is optional. */
export function assertOptionalNonEmptyString(value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }
  assertNonEmptyString(value, field);
}

/** `null` is allowed (it clears the column); a present non-null value must be a non-blank string. */
export function assertOptionalNullableString(value: unknown, field: string): void {
  if (value === undefined || value === null) {
    return;
  }
  assertNonEmptyString(value, field);
}

export function assertOptionalBoolean(value: unknown, field: string): void {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new BadRequestException(`${field} must be a boolean`);
  }
}

/**
 * A `carrierId`/`warehouseId` must be shaped like a UUID — those columns are
 * `@db.Uuid`, and Postgres rejects a malformed value with an "invalid input
 * syntax for type uuid" error that Prisma surfaces as P2007. Uncaught, that
 * is a 500 for what is plainly a bad request.
 */
export function assertUuid(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be a UUID`);
  }
}

/** Same, but tolerates an absent value — for optional query params. */
export function assertOptionalUuid(value: unknown, field: string): void {
  if (value === undefined) {
    return;
  }
  assertUuid(value, field);
}

/**
 * ISO-8601 date, or date-time with optional fractional seconds and an
 * optional `Z`/`±HH:MM` offset. Anchored, so nothing is accepted by prefix.
 *
 * Deliberately NOT a full RFC 3339 grammar — it does not check that the day
 * exists in the month. `new Date` does that afterwards (`2026-02-30` yields an
 * Invalid Date), so the two together cover shape AND validity, and neither
 * has to be a calendar implementation.
 */
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Parses a date query param, REJECTING one that is not ISO-8601.
 *
 * `new Date('garbage')` yields an Invalid Date whose every comparison is
 * `false`, so an unchecked value made `computeCarrierThroughput` quietly
 * return ALL-TIME throughput while the caller believed the answer was
 * windowed. "Grita, no adivina" — the module's own stated discipline
 * (`domain/src/delivery/errors.ts`).
 *
 * THE SHAPE IS CHECKED, not just the parse. A bare `Number.isNaN` test on
 * `new Date(value)` accepts a great deal that is not ISO-8601 at all: `2026`
 * parses (as `2026-01-01T00:00:00Z`), `Aug 1 2026` parses, `2026-8-1` parses
 * in the LOCAL timezone rather than UTC. Every one of them silently yields a
 * DIFFERENT window from the one the caller typed, while the 400 message this
 * function raises promises ISO-8601 — the message documented a contract the
 * code did not enforce, and the failure is silent because a mistyped bound
 * still returns a plausible-looking answer.
 */
export function parseDateParam(value: string | undefined, field: string): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = ISO_8601_PATTERN.test(value) ? new Date(value) : new Date(NaN);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      `${field} must be a valid ISO-8601 date (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ)`,
    );
  }
  return parsed;
}

/**
 * Parses a positive-integer query param (`?limit=50`).
 *
 * `Number('50abc')` is `NaN` but `parseInt('50abc')` is `50`, and `Number('')`
 * is `0` — so the sloppy readings turn a typo into either a silent default or
 * a page size of zero. Rejected outright instead: a caller who asked for a
 * page size deserves to know their request was not understood.
 */
export function parsePositiveIntParam(value: string | undefined, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return parsed;
}

/**
 * Rejects an INVERTED range.
 *
 * `?from=2026-08-01&to=2026-07-01` matches no row, so every carrier reports
 * `deliveredCount: 0` while `busy`/`inTransitCount` stay real — a dashboard
 * that looks perfectly operational and says nothing was ever delivered. Same
 * failure mode as an unparseable date (which `parseDateParam` already
 * rejects), and the same answer: "grita, no adivina".
 *
 * `from === to` is ALLOWED — both bounds are inclusive
 * (`computeCarrierThroughput`), so an equal pair is the single-instant
 * window, not an empty one.
 */
export function assertOrderedWindow(from: Date | undefined, to: Date | undefined): void {
  if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
    throw new BadRequestException('from must not be after to');
  }
}
