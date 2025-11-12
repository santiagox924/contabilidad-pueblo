import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BomModule } from '../bom/bom.module';
import { AccountingModule } from '../accounting/accounting.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [
    PrismaModule,
    BomModule, // para PRODUCE
    AccountingModule, // ⬅️ necesario para inyectar AccountingService
  ],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService], // otros módulos (Sales, Purchases, Transfers)
})
export class InventoryModule {}
