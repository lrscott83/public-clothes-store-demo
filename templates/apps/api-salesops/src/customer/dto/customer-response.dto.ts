/** Response shape for every Customer CRUD endpoint. Nulls are preserved as-is. */
export class CustomerResponseDto {
  id!: string;
  fullName!: string;
  documentId!: string | null;
  cellPhone!: string | null;
  email!: string | null;
  address!: string | null;
  note!: string | null;
  active!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
