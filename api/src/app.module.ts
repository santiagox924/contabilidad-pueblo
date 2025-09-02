import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { PartiesModule } from './parties/parties.module';
import { ItemsModule } from './items/items.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';

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
    SalesModule,
  ],
})
export class AppModule {}
