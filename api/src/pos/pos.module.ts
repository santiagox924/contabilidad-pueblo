import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [PosController],
  providers: [PosService, PrismaService],
  exports: [PosService],
})
export class PosModule {}
