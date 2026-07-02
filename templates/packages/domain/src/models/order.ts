import type { AuditableBaseModel } from './base';
import type { OrderType, PaymentType } from '../enums';
import type { InventoryEntryCost } from './inventory';

export interface OrderItem {
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  name: string;
  quantity: number;
  price: number;
  productBusinessId: string;
  productCosts: InventoryEntryCost[];
  order: number;
}

export interface Order extends AuditableBaseModel {
  id: string;
  orderItems: OrderItem[];
  total: number;
  itemsCount: number;
  date: Date;
  type: OrderType;
  paymentType: PaymentType;
  isCredit: boolean;
  description: string;
}
