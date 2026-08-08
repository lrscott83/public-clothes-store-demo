import { describe, it, expect } from 'vitest';
import {
  ERoles,
  EFeatures,
  EModules,
  PaymentType,
  OrderType,
  ExpenseType,
} from '../enums';

describe('ERoles', () => {
  it('SuperAdmin is 1', () => expect(ERoles.SuperAdmin).toBe(1));
  it('OwnerAdmin is 2', () => expect(ERoles.OwnerAdmin).toBe(2));
  it('StoreUser is 3', () => expect(ERoles.StoreUser).toBe(3));
  it('ReSeller is 4', () => expect(ERoles.ReSeller).toBe(4));
});

describe('EFeatures', () => {
  it('Tenants is 10', () => expect(EFeatures.Tenants).toBe(10));
  it('Owners is 11', () => expect(EFeatures.Owners).toBe(11));
  it('Roles is 12', () => expect(EFeatures.Roles).toBe(12));
  it('ReSellers is 13', () => expect(EFeatures.ReSellers).toBe(13));
  it('Features is 14', () => expect(EFeatures.Features).toBe(14));
  it('AdminStores is 15', () => expect(EFeatures.AdminStores).toBe(15));
  it('AdminDashboard is 16', () => expect(EFeatures.AdminDashboard).toBe(16));
  it('Products is 20', () => expect(EFeatures.Products).toBe(20));
  it('Sale is 21', () => expect(EFeatures.Sale).toBe(21));
  it('TodayOrders is 22', () => expect(EFeatures.TodayOrders).toBe(22));
  it('TodayStats is 23', () => expect(EFeatures.TodayStats).toBe(23));
  it('Available is 30', () => expect(EFeatures.Available).toBe(30));
  it('Entries is 31', () => expect(EFeatures.Entries).toBe(31));
  it('Egress is 33', () => expect(EFeatures.Egress).toBe(33));
  it('InventoryTodayQuantities is 34', () => expect(EFeatures.InventoryTodayQuantities).toBe(34));
  it('InventoryTodaySaleProfit is 35', () => expect(EFeatures.InventoryTodaySaleProfit).toBe(35));
  it('Send is 40', () => expect(EFeatures.Send).toBe(40));
  it('Download is 41', () => expect(EFeatures.Download).toBe(41));
  it('Receive is 42', () => expect(EFeatures.Receive).toBe(42));
  it('TodayReports is 50', () => expect(EFeatures.TodayReports).toBe(50));
  it('Dashboard is 60', () => expect(EFeatures.Dashboard).toBe(60));
  it('Profile is 70', () => expect(EFeatures.Profile).toBe(70));
  it('Users is 72', () => expect(EFeatures.Users).toBe(72));
  it('Stores is 73', () => expect(EFeatures.Stores).toBe(73));
  it('Configurations is 74', () => expect(EFeatures.Configurations).toBe(74));
  it('TodayExpenses is 80', () => expect(EFeatures.TodayExpenses).toBe(80));
  it('Billing is 90', () => expect(EFeatures.Billing).toBe(90));
  it('SalesHistory is 100', () => expect(EFeatures.SalesHistory).toBe(100));
  it('EntriesHistory is 101', () => expect(EFeatures.EntriesHistory).toBe(101));
  it('ExpensesHistory is 102', () => expect(EFeatures.ExpensesHistory).toBe(102));
  it('CreditsHistory is 103', () => expect(EFeatures.CreditsHistory).toBe(103));
  it('CreditSale is 110', () => expect(EFeatures.CreditSale).toBe(110));
});

describe('EModules', () => {
  it('Administration is 1', () => expect(EModules.Administration).toBe(1));
  it('Sales is 2', () => expect(EModules.Sales).toBe(2));
  it('Inventory is 3', () => expect(EModules.Inventory).toBe(3));
  it('Synchronization is 4', () => expect(EModules.Synchronization).toBe(4));
  it('Reports is 5', () => expect(EModules.Reports).toBe(5));
  it('Statistics is 6', () => expect(EModules.Statistics).toBe(6));
  it('Management is 7', () => expect(EModules.Management).toBe(7));
  it('Expenses is 8', () => expect(EModules.Expenses).toBe(8));
  it('Billing is 9', () => expect(EModules.Billing).toBe(9));
  it('Histories is 10', () => expect(EModules.Histories).toBe(10));
  it('Credits is 11', () => expect(EModules.Credits).toBe(11));
});

describe('PaymentType', () => {
  it('Efectivo is 1', () => expect(PaymentType.Efectivo).toBe(1));
  it('Tarjeta is 2', () => expect(PaymentType.Tarjeta).toBe(2));
  it('Zelle is 3', () => expect(PaymentType.Zelle).toBe(3));
});

describe('OrderType', () => {
  it('Normal is 1', () => expect(OrderType.Normal).toBe(1));
  it('Mayorista is 2', () => expect(OrderType.Mayorista).toBe(2));
  it('Merma is 3', () => expect(OrderType.Merma).toBe(3));
  it('Ajuste is 4', () => expect(OrderType.Ajuste).toBe(4));
  it('Otro is 100', () => expect(OrderType.Otro).toBe(100));
});

describe('ExpenseType', () => {
  it('Salario is 1', () => expect(ExpenseType.Salario).toBe(1));
  it('Transporte is 2', () => expect(ExpenseType.Transporte).toBe(2));
  it('Alquiler is 3', () => expect(ExpenseType.Alquiler).toBe(3));
  it('Corriente is 4', () => expect(ExpenseType.Corriente).toBe(4));
  it('Agua is 5', () => expect(ExpenseType.Agua).toBe(5));
  it('Comida is 6', () => expect(ExpenseType.Comida).toBe(6));
  it('Operaciones is 7', () => expect(ExpenseType.Operaciones).toBe(7));
  it('Viaje is 8', () => expect(ExpenseType.Viaje).toBe(8));
  it('Divisa is 9', () => expect(ExpenseType.Divisa).toBe(9));
  it('Impuesto is 10', () => expect(ExpenseType.Impuesto).toBe(10));
  it('Otro is 100', () => expect(ExpenseType.Otro).toBe(100));
});
