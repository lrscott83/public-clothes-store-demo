/** Request body for `POST /categories`. */
export class CreateCategoryDto {
  name!: string;
  slug!: string;
  image?: string;
  icon?: string;
  order!: number;
  active?: boolean;
}
