// api/src/sales/sales.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BomModule } from '../bom/bom.module';
import { AccountingModule } from '../accounting/accounting.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { TaxesModule } from '../taxes/taxes.module';
import { WithholdingsModule } from '../withholdings/withholdings.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [
    PrismaModule,
    InventoryModule, // consultas/movimientos de stock si se usan desde ventas
    BomModule, // explosión BOM
    AccountingModule, // para postear asientos contables de facturas de venta
    TaxesModule, // <<< nuevo: provee TaxesService
    WithholdingsModule, // <<< nuevo: provee WithholdingsService
    TreasuryModule, // acceso a Tesorería para generar recibos vinculados
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
