import { ConflictException, Inject, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Company, ICompanyRepository, IUserRepository } from '@store-mgmt/domain';
import { DuplicateCompanySlugError, DuplicateLoginError, COMPANY_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import type { CreateUserInput } from '@store-mgmt/domain';
import { CreateCompanySaga } from '../company/create-company.saga.js';

const SALT_ROUNDS = 10;

export interface CreateOnBehalfInput {
  readonly name: string;
  readonly slug: string;
  readonly type: 'catalog';
  readonly ownerLogin: string;
  /** Plaintext temporary password — lives ONLY in this call's response. */
  readonly temporaryPassword: string;
}

export interface CreateOnBehalfResult {
  readonly company: Company;
  readonly ownerLogin: string;
  /** Plaintext, returned EXACTLY ONCE to the console's success state. */
  readonly temporaryPassword: string;
}

/**
 * Platform create-on-behalf composition (design D3). The ENDPOINT layer
 * composes two untouched pieces in this exact order:
 *
 *   1. `bcrypt.hash(temporaryPassword, 10)`
 *   2. `userRepository.create` — the owner master `User`
 *      (`DuplicateLoginError` → 409; the saga is NEVER invoked)
 *   3. `createCompanySaga.run({ name, slug, ownerId })` — byte-for-byte the
 *      same saga self-service `POST /companies` runs (input contract
 *      `{name, slug, ownerId}`); its `DuplicateCompanySlugError` → 409.
 *
 * Orphan-owner stance (spec: salesops-platform "Create Company On Behalf"):
 * if the saga fails after step 2, the owner User without Membership is a
 * documented harmless state — it cannot authenticate into any tenant
 * (`UsersService.create`'s explicit precedent). No compensation code here,
 * deliberately.
 *
 * SECURITY: the plaintext password appears ONLY in this one response value.
 * It is never logged by this service and never persisted — only its bcrypt
 * hash reaches `userRepository.create`.
 */
@Injectable()
export class PlatformService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
    private readonly createCompanySaga: CreateCompanySaga,
  ) {}

  async listCompanies(): Promise<Company[]> {
    return this.companyRepository.list();
  }

  async createOnBehalf(input: CreateOnBehalfInput): Promise<CreateOnBehalfResult> {
    const passwordHash = await bcrypt.hash(input.temporaryPassword, SALT_ROUNDS);

    const createInput: CreateUserInput = {
      login: input.ownerLogin,
      passwordHash,
      fullName: input.ownerLogin,
    };

    let owner;
    try {
      owner = await this.userRepository.create(createInput);
    } catch (err) {
      if (err instanceof DuplicateLoginError) {
        // The saga must not run — no Company row may be created on a
        // duplicate owner login (spec scenario).
        throw new ConflictException(err.message);
      }
      throw err;
    }

    let company: Company;
    try {
      const result = await this.createCompanySaga.run({
        name: input.name,
        slug: input.slug,
        ownerId: owner.id,
      });
      const created = await this.companyRepository.findById(result.companyId);
      if (!created) {
        throw new Error(`Saga reported companyId ${result.companyId} but the row is missing`);
      }
      company = created;
    } catch (err) {
      if (err instanceof DuplicateCompanySlugError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    return { company, ownerLogin: owner.login, temporaryPassword: input.temporaryPassword };
  }
}
