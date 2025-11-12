import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RequireRoles } from '../auth/roles.decorator';
import { UserRoleCode } from '@prisma/client';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';

@RequireRoles(UserRoleCode.SUPER_ADMIN, UserRoleCode.ADMINISTRATOR)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Patch(':id/roles')
  updateRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.users.setRoles(id, dto.roles ?? []);
  }
}
