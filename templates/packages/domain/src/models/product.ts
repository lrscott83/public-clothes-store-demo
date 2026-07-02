import type { AuditableBaseModel } from './base';

export interface ProductCategory {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

export interface Product extends AuditableBaseModel {
  id: string;
  name: string;
  barcode?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  order: number;
  availableToSale: boolean;
  discountFromInvantory: boolean;
  businessId: string;
}
