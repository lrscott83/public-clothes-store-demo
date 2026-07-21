/** Response shape for every Warehouse CRUD endpoint. */
export class WarehouseResponseDto {
  id!: string;
  name!: string;
  active!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
