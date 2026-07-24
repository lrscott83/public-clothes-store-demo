/** Partial update for `PATCH /users/:id` — profile fields and/or `roles` bitmask reassignment. */
export class UpdateUserDto {
  fullName?: string;
  email?: string;
  cellPhone?: string;
  roles?: number;
  isActive?: boolean;
}
