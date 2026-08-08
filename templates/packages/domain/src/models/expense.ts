import type { AuditableBaseModel } from './base';
import type { ExpenseType, PaymentType } from '../enums';

export interface Expense extends AuditableBaseModel {
  id: string;
  type: ExpenseType;
  total: number;
  date: Date;
  paymentType: PaymentType;
  note: string;
}
