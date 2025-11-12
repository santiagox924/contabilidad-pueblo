// src/bom/bom.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BomService } from './bom.service';
import { BomController } from './bom.controller';

@Module({
  imports: [PrismaModule],
  providers: [BomService],
  controllers: [BomController],
  exports: [BomService],
})
export class BomModule {}
