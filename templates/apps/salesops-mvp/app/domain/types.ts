import type { StoreProduct } from '@store-mgmt/storefront/catalog';

/** Catalog product enriched at seed-build time with frozen commission + cost data. */
export interface SeededProduct extends StoreProduct {
  commissionMN: number;
  costUSD: number;
}

export interface Warehouse {
  id: string;
  name: string;
}

export interface Gestor {
  id: string;
  name: string;
  phone?: string;
}

export interface Transportista {
  id: string;
  name: string;
}

export interface ExchangeRates {
  usdToMn: number;
  zelle: number;
  eur: number;
}

export interface InventoryEntry {
  productId: string;
  warehouseId: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  priceUSD: number;
  commissionMN: number;
}

export interface Client {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  deliveryMode?: 'domicilio' | 'recogida';
}

export interface PaymentInfo {
  method: string;
  needsChange?: boolean;
}

export type OrderState = 'creado' | 'verificado' | 'transportando' | 'entregado' | 'comision_pagada';

export interface Order {
  id: string;
  items: OrderItem[];
  client: Client;
  payment: PaymentInfo;
  warehouseId: string;
  gestorId: string;
  transportistaId?: string;
  state: OrderState;
  totalUSD: number;
  exchangeRateSnapshot?: { usdToMn: number };
  totalMN?: number;
  commissionMN?: number;
  saleType?: string;
  observations?: string;
  createdAt: string;
  verifiedAt?: string;
  transportingAt?: string;
  deliveredAt?: string;
  commissionPaidAt?: string;
}

export interface SeedState {
  version: number;
  generatedAt: string;
  products: SeededProduct[];
  warehouses: Warehouse[];
  gestores: Gestor[];
  transportistas: Transportista[];
  inventory: InventoryEntry[];
  exchangeRates: ExchangeRates;
  orders: Order[];
}
