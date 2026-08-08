import { IsNotEmpty, IsString, Matches } from 'class-validator';

/**
 * Request body for `POST /companies` — an authenticated `User` provisions
 * their OWN company and becomes its OWNER (design.md D7,
 * `create-company.saga.ts`). `ownerId` is NEVER accepted here — it comes
 * from `req.user.id` (the authenticated caller), never from the request
 * body, so no caller can provision a company on someone else's behalf.
 */
export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric segments separated by single hyphens',
  })
  slug!: string;
}
