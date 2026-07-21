/** Request body for `PATCH /customers/:id` — every field optional. */
export class UpdateCustomerDto {
  fullName?: string;
  documentId?: string;
  cellPhone?: string;
  email?: string;
  address?: string;
  note?: string;
  active?: boolean;
}
