/** Response shape for every Category CRUD endpoint. */
export class CategoryResponseDto {
  id!: string;
  name!: string;
  slug!: string;
  image!: string | null;
  icon!: string | null;
  order!: number;
  active!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
