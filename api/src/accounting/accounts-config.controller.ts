import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { AccountsConfigService } from './accounts-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CanConfigureMapPolicy } from './policies/can-configure-map.policy';

@Controller('accounting/config/accounts-map')
@UseGuards(JwtAuthGuard, CanConfigureMapPolicy)
export class AccountsConfigController {
  constructor(private readonly accountsConfigService: AccountsConfigService) {}

  @Get()
  async getMap() {
    return this.accountsConfigService.getLatestMap();
  }

  @Put()
  async updateMap(@Body() body: any) {
    if (!body || typeof body !== 'object') {
      throw new ForbiddenException('Formato inválido de mapa de cuentas.');
    }
    return this.accountsConfigService.saveMap(body);
  }
}
