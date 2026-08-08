/** Response shape for any endpoint returning a `User` — NEVER includes `passwordHash`. */
export class UserResponseDto {
  id!: string;
  login!: string;
  fullName!: string;
  email!: string | null;
  cellPhone!: string | null;
  isActive!: boolean;
  roles!: number;
  /** Spanish, UI-facing display labels for every role bit held (`RoleHelpers.getRoleLabels`). */
  roleLabels!: string[];
  createdAt!: string;
  updatedAt!: string;
}
