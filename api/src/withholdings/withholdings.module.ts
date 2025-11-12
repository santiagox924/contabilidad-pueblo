import { Module } from '@nestjs/common';
import { WithholdingsService } from './withholdings.service';
import { WithholdingsController } from './withholdings.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [WithholdingsController],
  providers: [WithholdingsService, PrismaService],
  exports: [WithholdingsService],
})
export class WithholdingsModule {}
