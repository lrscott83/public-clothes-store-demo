import { IsIn, IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

/**
 * Create-on-behalf payload (design D3 / HTTP contract). Deliberately a
 * SEPARATE class from the self-service `create-company.dto.ts` — that DTO's
 * security property ("ownerId is NEVER accepted here") is load-bearing and
 * MUST NOT be widened to accept owner credentials.
 *
 * SECURITY (FIX 4 precedent): value-imported (NOT `import type`) by the
 * controller — the global `ValidationPipe` needs the real class at runtime
 * via `design:paramtypes` for the `@Body()` parameter; a type-only import
 * erases the class and Nest silently skips validation/whitelisting.
 */
export class CreatePlatformCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug must match ^[a-z0-9]+(-[a-z0-9]+)*$' })
  slug!: string;

  /** Only `'catalog'` exists today (spec: salesops-companies "Company Type Metadata Field"). */
  @IsIn(['catalog'])
  type!: 'catalog';

  @IsString()
  @IsNotEmpty()
  ownerLogin!: string;

  @IsString()
  @MinLength(8)
  temporaryPassword!: string;
}
