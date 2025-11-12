// api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { PartiesModule } from './parties/parties.module';
import { ItemsModule } from './items/items.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PurchasesModule } from './purchases/purchases.module';
import { TreasuryModule } from './treasury/treasury.module';
import { AccountingModule } from './accounting/accounting.module';
import { BomModule } from './bom/bom.module';
import { PayrollModule } from './payroll/payroll.module';
import { TaxesModule } from './taxes/taxes.module';
import { WithholdingsModule } from './withholdings/withholdings.module';
import { PartnersFiscalModule } from './partners-fiscal/partners-fiscal.module'; // <-- ya estaba
import { PosModule } from './pos/pos.module'; // <-- ✨ NUEVO
import { FiscalModule } from './fiscal/fiscal.module';
import { FixedAssetsModule } from './fixed-assets/fixed-assets.module';
import { CategoriesModule } from './categories/categories.module';
import { GeoModule } from './common/geo/geo.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccountsModule,
    UsersModule,
    AuthModule,
    AuditModule,
    PartiesModule,
    ItemsModule,
    InventoryModule,
    BomModule,
    PayrollModule,
    TaxesModule,
    WithholdingsModule,
    PartnersFiscalModule,
    CategoriesModule,
    GeoModule,
    SalesModule,
    PurchasesModule,
    TreasuryModule,
    AccountingModule,
    PosModule, // <-- ✨ agregado
    FixedAssetsModule,
    FiscalModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
