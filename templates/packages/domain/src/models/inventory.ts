import type { AuditableBaseModel } from './base';

export interface EgressEntry extends AuditableBaseModel {
  id: string;
  productId: string;
  categoryId: string;
  quantity: number;
  egressType: 'waste' | 'return' | 'transfer' | 'adjustment';
  notes?: string;
  date: Date;
}

export interface InventoryEntryCost {
  id: string;
  quantity: number;
  costPrice: number;
}

export interface InventoryEntry extends AuditableBaseModel {
  id: string;
  productId: string;
  categoryId: string;
  quantity: number;
  available: number;
  costPrice: number;
  date: Date;
  order: number;
}

export interface InventoryEntryView {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  date: Date;
  isActive: boolean;
}
