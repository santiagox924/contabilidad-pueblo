import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingExportController } from './accounting.export.controller';

@Module({
  imports: [PrismaModule],
  providers: [AccountingService],
  controllers: [AccountingController, AccountingExportController],
})
export class AccountingModule {}
