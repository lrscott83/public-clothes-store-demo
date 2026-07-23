import type { CreateUserInput, User } from './user.js';

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type UserUpdateInput = Partial<Omit<User, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing `User` identities. Zero dependency on any
 * persistence technology — domain and application code import this
 * interface, never a concrete Prisma class. `findByLogin` is used only by
 * `LocalStrategy`/`validateUser` at login time; `findById` is used by
 * `JwtStrategy` to resolve `req.user` FRESH per request (ADR-2).
 */
export interface IUserRepository {
  create(input: CreateUserInput): Promise<User>;
  update(id: string, patch: UserUpdateInput): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByLogin(login: string): Promise<User | null>;
  list(): Promise<User[]>;
}

/** DI token for `IUserRepository` — consumers inject by this symbol. */
export const USER_REPOSITORY = Symbol('IUserRepository');
