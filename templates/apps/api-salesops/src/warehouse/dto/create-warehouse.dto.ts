/** Request body for `POST /warehouses`. No location/address fields — FLAT master data. */
export class CreateWarehouseDto {
  name!: string;
  active?: boolean;
}
