/** Request body for `POST /customers`. Only `fullName` is required — FLAT master data, no money fields. */
export class CreateCustomerDto {
  fullName!: string;
  documentId?: string;
  cellPhone?: string;
  email?: string;
  address?: string;
  note?: string;
  active?: boolean;
}
