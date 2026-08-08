export interface BaseModel {
  id: unknown;
}

export interface AuditableBaseModel extends BaseModel {
  isActive: boolean;
  createdDate: Date;
  createdByName: string;
  updatedDate?: Date;
  updatedByName?: string;
}

export interface BaseResponseModel<T> {
  data: T;
  succeeded: boolean;
  message: string;
  actionCode: number;
  errors: BaseError[];
}

export interface BaseError {
  code: string;
  description: string;
}
