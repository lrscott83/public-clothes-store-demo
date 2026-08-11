/** `GET /public/categories` item (design.md §3) — active only. */
export interface PublicCategoryDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly image: string | null;
  readonly order: number;
}
