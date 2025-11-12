import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingModule } from '../accounting/accounting.module';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';
import { TreasuryHrService } from './hr/hr.service';
import { TreasuryHrController } from './hr/hr.controller';

@Module({
  imports: [
    PrismaModule,
    AccountingModule, // para registrar asientos de cobros y pagos
  ],
  providers: [TreasuryService, TreasuryHrService],
  controllers: [TreasuryController, TreasuryHrController],
  exports: [TreasuryService, TreasuryHrService], // útil si otros módulos llaman a tesorería
})
export class TreasuryModule {}
