import { Module } from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { TaxesController } from './taxes.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [TaxesController],
  providers: [TaxesService, PrismaService],
  exports: [TaxesService],
})
export class TaxesModule {}
