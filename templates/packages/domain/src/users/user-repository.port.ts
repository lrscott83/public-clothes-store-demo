import type { CreateUserInput, User } from './user.js';

/**
 * Partial update payload — `id`/`createdAt` are immutable once persisted.
 * SECURITY (FIX 4): `passwordHash` is deliberately EXCLUDED here — password
 * changes MUST go through the dedicated `IUserRepository.updatePassword`
 * method, never the generic `update`. This is enforced at the type level so
 * a future caller cannot accidentally smuggle a password change through the
 * generic profile-update path (which is reachable from the public
 * `PATCH /users/:id` HTTP surface).
 */
export type UserUpdateInput = Partial<Omit<User, 'id' | 'createdAt' | 'passwordHash'>>;

/**
 * Port for reading/writing `User` identities. Zero dependency on any
 * persistence technology — domain and application code import this
 * interface, never a concrete Prisma class. `findByLogin` is used only by
 * `LocalStrategy`/`validateUser` at login time; `findById` is used by
 * `JwtStrategy` to resolve `req.user` FRESH per request (ADR-2).
 */
export interface IUserRepository {
  create(input: CreateUserInput): Promise<User>;
  /** Generic profile update — NEVER touches `passwordHash` (SECURITY FIX 4). */
  update(id: string, patch: UserUpdateInput): Promise<User>;
  /** The ONLY path allowed to change `passwordHash` (SECURITY FIX 4) — used by `AuthService.changePassword`/`resetPassword`. */
  updatePassword(id: string, passwordHash: string): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByLogin(login: string): Promise<User | null>;
  list(): Promise<User[]>;
}

/** DI token for `IUserRepository` — consumers inject by this symbol. */
export const USER_REPOSITORY = Symbol('IUserRepository');
