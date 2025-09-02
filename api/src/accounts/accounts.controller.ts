// src/accounts/accounts.controller.ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; // 👈 importa el guard

@UseGuards(JwtAuthGuard) // 👈 protege todas las rutas del controlador
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  findAll() {
    return this.accounts.findAll();
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }
}
