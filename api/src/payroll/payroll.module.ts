import { Module } from '@nestjs/common';
import { AccountingModule } from '../accounting/accounting.module';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AccountingModule],
  controllers: [PayrollController],
  providers: [PayrollService, PrismaService],
})
export class PayrollModule {}
