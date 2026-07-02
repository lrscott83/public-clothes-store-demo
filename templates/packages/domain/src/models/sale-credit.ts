import type { AuditableBaseModel } from './base';
import type { PaymentType } from '../enums';

export interface SaleCredit extends AuditableBaseModel {
  id: string;
  orderId: string;
  client: string;
  total: number;
  date: Date;
  paid: number;
  isPaid: boolean;
  paidDate: Date;
  paidType: PaymentType;
  note: string;
}
