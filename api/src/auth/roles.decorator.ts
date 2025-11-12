import { SetMetadata } from '@nestjs/common';
import { UserRoleCode } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const RequireRoles = (...roles: UserRoleCode[]) =>
  SetMetadata(ROLES_KEY, roles);
