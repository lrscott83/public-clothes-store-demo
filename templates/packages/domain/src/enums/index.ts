export enum ERoles {
  SuperAdmin = 1,
  OwnerAdmin = 2,
  StoreUser = 3,
  ReSeller = 4,
}

export enum EFeatures {
  Tenants = 10,
  Owners = 11,
  Roles = 12,
  ReSellers = 13,
  Features = 14,
  AdminStores = 15,
  AdminDashboard = 16,
  Products = 20,
  Sale = 21,
  TodayOrders = 22,
  TodayStats = 23,
  Available = 30,
  Entries = 31,
  Egress = 33,
  InventoryTodayQuantities = 34,
  InventoryTodaySaleProfit = 35,
  Send = 40,
  Download = 41,
  Receive = 42,
  TodayReports = 50,
  Dashboard = 60,
  Profile = 70,
  Users = 72,
  Stores = 73,
  Configurations = 74,
  TodayExpenses = 80,
  Billing = 90,
  SalesHistory = 100,
  EntriesHistory = 101,
  ExpensesHistory = 102,
  CreditsHistory = 103,
  CreditSale = 110,
}

export enum EModules {
  Administration = 1,
  Sales = 2,
  Inventory = 3,
  Synchronization = 4,
  Reports = 5,
  Statistics = 6,
  Management = 7,
  Expenses = 8,
  Billing = 9,
  Histories = 10,
  Credits = 11,
}

export enum PaymentType {
  Efectivo = 1,
  Tarjeta = 2,
  Zelle = 3,
}

export enum OrderType {
  Normal = 1,
  Mayorista = 2,
  Merma = 3,
  Ajuste = 4,
  Otro = 100,
}

export enum ExpenseType {
  Salario = 1,
  Transporte = 2,
  Alquiler = 3,
  Corriente = 4,
  Agua = 5,
  Comida = 6,
  Operaciones = 7,
  Viaje = 8,
  Divisa = 9,
  Impuesto = 10,
  Otro = 100,
}
