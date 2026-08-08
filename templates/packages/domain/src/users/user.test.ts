import { describe, it, expect } from 'vitest';
import { createUser } from './user.js';
import { InvalidUserError } from './errors.js';

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

describe('createUser — invariants', () => {
  it('creates a user with only login, passwordHash and fullName', () => {
    const user = createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    expect(user.login).toBe('jdoe');
    expect(user.fullName).toBe('Jane Doe');
    expect(user.email).toBeNull();
    expect(user.cellPhone).toBeNull();
  });

  it('defaults isActive to true', () => {
    const user = createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    expect(user.isActive).toBe(true);
  });

  it('produces a User with no roles field — authorization lives in CompanyUser', () => {
    const user = createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    expect(Object.keys(user)).not.toContain('roles');
  });

  it('produces a User with no isEmailVerified field', () => {
    const user = createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: 'Jane Doe' });
    expect(Object.keys(user)).not.toContain('isEmailVerified');
  });

  it('rejects an empty login', () => {
    expect(() => createUser({ login: '', passwordHash: VALID_HASH, fullName: 'Jane Doe' })).toThrow(
      InvalidUserError,
    );
  });

  it('rejects a whitespace-only login', () => {
    expect(() => createUser({ login: '   ', passwordHash: VALID_HASH, fullName: 'Jane Doe' })).toThrow(
      InvalidUserError,
    );
  });

  it('rejects an empty fullName', () => {
    expect(() => createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: '' })).toThrow(InvalidUserError);
  });

  it('rejects a whitespace-only fullName', () => {
    expect(() => createUser({ login: 'jdoe', passwordHash: VALID_HASH, fullName: '   ' })).toThrow(
      InvalidUserError,
    );
  });

  it('rejects a missing passwordHash', () => {
    expect(() => createUser({ login: 'jdoe', passwordHash: '', fullName: 'Jane Doe' })).toThrow(InvalidUserError);
  });

  it('rejects a passwordHash that is not bcrypt-shaped (never plaintext)', () => {
    expect(() =>
      createUser({ login: 'jdoe', passwordHash: 'plaintext-password', fullName: 'Jane Doe' }),
    ).toThrow(InvalidUserError);
  });

  it('accepts an explicit email and cellPhone', () => {
    const user = createUser({
      login: 'jdoe',
      passwordHash: VALID_HASH,
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      cellPhone: '555-1234',
    });
    expect(user.email).toBe('jane@example.com');
    expect(user.cellPhone).toBe('555-1234');
  });
});
