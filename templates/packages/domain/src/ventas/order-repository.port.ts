import type { CreateOrderInput, Order, OrderStatus } from './order.js';

/** Optional filter for `IOrderRepository.list`. */
export interface OrderListFilter {
  /** When omitted or `false`, `active: false` orders are excluded (default listing). */
  readonly includeInactive?: boolean;
  readonly customerId?: string;
  readonly status?: OrderStatus;
}

/** Partial update payload — `id`/`createdAt` are immutable once persisted. */
export type OrderUpdateInput = Partial<Omit<Order, 'id' | 'createdAt'>>;

/**
 * Port for reading/writing the `Order` aggregate. Zero dependency on any
 * persistence technology — domain and application code import this
 * interface, never a concrete Prisma class. `create` persists an already
 * factory-validated aggregate (`createOrder` output) in one round-trip;
 * `confirm`/`deliver`/`cancel` are the THREE atomic status transitions
 * (design decision #8) — each wraps its own guard + stock-bridge side
 * effect (reserve/consume+release/release) in a single transaction at the
 * infra layer. `softDelete` flips `active`, never a hard DELETE.
 */
export interface IOrderRepository {
  create(input: CreateOrderInput): Promise<Order>;
  update(id: string, patch: OrderUpdateInput): Promise<Order>;
  softDelete(id: string): Promise<void>;
  findById(id: string): Promise<Order | null>;
  list(filter?: OrderListFilter): Promise<Order[]>;
  /** `creado -> verificado`: freezes rate+totals AND reserves stock per line. */
  confirm(id: string): Promise<Order>;
  /** `verificado -> entregado`: releases the reservation THEN consumes stock (`sale_out`) per line. */
  deliver(id: string): Promise<Order>;
  /** `creado|verificado -> cancelado`: releases the reservation per line when source is `verificado`; no-op when source is `creado`. */
  cancel(id: string): Promise<Order>;
}

/** DI token for `IOrderRepository` — consumers inject by this symbol. */
export const ORDER_REPOSITORY = Symbol('IOrderRepository');
