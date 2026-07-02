import type { AuditableBaseModel } from './base';

export interface Module {
  id: number;
  name: string;
  price: number;
  currentPrice: number;
  priceIncluded: boolean;
  discountText: string;
  selected: boolean;
}

export interface Feature {
  id: number;
  name: string;
  moduleId: number;
  displayName: string;
  description: string;
  order: number;
  availableToStore: boolean;
}

export interface Store {
  id: string;
  name: string;
  displayName: string;
  ownerId: string;
  ownerName: string;
  address: string;
  description: string;
  approved: boolean;
  paymentStartDate: Date;
  modules: Module[];
  isActive: boolean;
}

export interface OwnerStoreModule {
  storeName: string;
  storeModuleTotalCurrentPrice: number;
}

export interface Owner extends AuditableBaseModel {
  id: string;
  userId: string;
  fullName: string;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
  storeModules: OwnerStoreModule[];
  reSellerId: string;
  reSellerName: string;
  approved: boolean;
}

export interface ReSeller extends AuditableBaseModel {
  id: string;
  userId: string;
  // Returned by the reseller detail endpoint; omitted by the list endpoint.
  login?: string;
  fullName: string;
  percentDiscountPrice: number;
  discountPrice: number;
  cellPhone: string;
  email: string;
  description: string;
  guest: boolean;
}

export interface StoreUser {
  id: string;
  storeId: string;
  storeName: string;
  login: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}

export interface User {
  id: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
}
