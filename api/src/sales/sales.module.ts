import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [PrismaModule, InventoryModule], // 👈 aquí traes InventoryService y PrismaService
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
