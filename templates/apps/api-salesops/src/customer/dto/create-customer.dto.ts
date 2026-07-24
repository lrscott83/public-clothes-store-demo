/**
 * Request body for `POST /customers`. `fullName` and `userId` are required —
 * FLAT master data, no money fields. `userId` is the REQUIRED, UNIQUE (1:1)
 * link to an existing `User` login identity (backend-users-roles) — a
 * Customer can never be created without one.
 */
export class CreateCustomerDto {
  fullName!: string;
  userId!: string;
  documentId?: string;
  cellPhone?: string;
  email?: string;
  address?: string;
  note?: string;
  active?: boolean;
}
