import { Inject, Injectable } from '@nestjs/common';
import type { Customer as DomainCustomer, ICustomerRepository } from '@store-mgmt/domain';
import { CUSTOMER_REPOSITORY, createCustomer } from '@store-mgmt/domain';
import type { CreateCustomerDto, CustomerResponseDto, UpdateCustomerDto } from './dto/index.js';

/**
 * Orchestration layer for customers: the only place with I/O (via
 * `CUSTOMER_REPOSITORY`). Maps the domain `Customer` to the API's
 * `CustomerResponseDto` (dates -> ISO strings, nulls preserved). Mirrors
 * `WarehouseService`.
 *
 * `create`/`update` run the payload through the domain guardian
 * `createCustomer()` BEFORE delegating to the repository — this is the only
 * place `InvalidCustomerError` can genuinely fire on the real HTTP path (the
 * repository/Prisma layer has no notion of the invariant, by design). The
 * built `Customer` from `createCustomer()` is discarded on `create` — the
 * repository/DB remains the single source of truth for `id`/`createdAt` —
 * it is called purely to enforce "non-empty, non-whitespace fullName,
 * scream not guess".
 */
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository,
  ) {}

  async create(input: CreateCustomerDto): Promise<CustomerResponseDto> {
    createCustomer(input);
    const created = await this.customerRepository.create(input);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateCustomerDto): Promise<CustomerResponseDto> {
    if (patch.fullName !== undefined) {
      createCustomer({ ...patch, fullName: patch.fullName });
    }
    const updated = await this.customerRepository.update(id, patch);
    return this.toResponse(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.customerRepository.softDelete(id);
  }

  async findById(id: string): Promise<CustomerResponseDto | null> {
    const found = await this.customerRepository.findById(id);
    return found ? this.toResponse(found) : null;
  }

  async list(includeInactive = false): Promise<CustomerResponseDto[]> {
    const rows = await this.customerRepository.list({ includeInactive });
    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(customer: DomainCustomer): CustomerResponseDto {
    return {
      id: customer.id,
      fullName: customer.fullName,
      documentId: customer.documentId,
      cellPhone: customer.cellPhone,
      email: customer.email,
      address: customer.address,
      note: customer.note,
      active: customer.active,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
