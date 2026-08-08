/** Request body for `PATCH /categories/:id` — every field optional. */
export class UpdateCategoryDto {
  name?: string;
  slug?: string;
  image?: string;
  icon?: string;
  order?: number;
  active?: boolean;
}
