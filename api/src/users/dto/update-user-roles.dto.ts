import { UserRoleCode } from '@prisma/client';
import { IsArray, IsEnum } from 'class-validator';

export class UpdateUserRolesDto {
  @IsArray()
  @IsEnum(UserRoleCode, { each: true })
  roles!: UserRoleCode[];
}
