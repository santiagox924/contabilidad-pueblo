import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [PrismaModule],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService], // 👈 para que otros módulos lo inyecten
})
export class InventoryModule {}
