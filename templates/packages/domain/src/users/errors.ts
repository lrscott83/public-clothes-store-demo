/**
 * Named domain errors for the Users/Identity module. Guards throw these
 * explicitly instead of silently clamping/defaulting invalid input — "grita,
 * no adivina" (scream, not guess), matching the Customer/Sales modules'
 * error discipline.
 */

export class InvalidUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUserError';
  }
}

/** Thrown when a `login` would collide with an existing user's. */
export class DuplicateLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateLoginError';
  }
}
