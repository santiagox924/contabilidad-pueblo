import { Module } from '@nestjs/common';
import { PartnersFiscalService } from './partners-fiscal.service';
import { PartnersFiscalController } from './partners-fiscal.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PartnersFiscalController],
  providers: [PartnersFiscalService, PrismaService],
  exports: [PartnersFiscalService],
})
export class PartnersFiscalModule {}
