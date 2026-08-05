/** Response shape for `POST /companies` — mirrors `CreateCompanySagaResult` (design.md D7). */
export class CompanyResponseDto {
  companyId!: string;
  schemaName!: string;
  ownerCompanyUserId!: string;
  categoriesCopied!: number;
  productsCopied!: number;
}
