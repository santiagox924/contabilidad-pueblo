// api/src/accounting/account-settings.controller.ts
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccountSettingsService } from './config/account-settings.service';
import { UpdateAccountSettingDto } from './dto/account-setting.dto';

@UseGuards(JwtAuthGuard)
@Controller('accounting/config')
export class AccountSettingsController {
  constructor(private readonly accountSettings: AccountSettingsService) {}

  @Get('purchases')
  listPurchaseAccounts() {
    return this.accountSettings.listByScope('PURCHASES');
  }

  @Patch('accounts/:key')
  updateAccount(
    @Param('key') key: string,
    @Body() dto: UpdateAccountSettingDto,
  ) {
    return this.accountSettings.setAccountCode(key, dto.accountCode);
  }
}
