// api/src/accounting/accounting.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { PrismaModule } from '../prisma/prisma.module';

import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingExportController } from './accounting.export.controller';

import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { MatchingService } from './reconciliation/matching/matching.service';

import { ImportController } from './reconciliation/import.controller';
import { ImportService } from './reconciliation/import.service';

import { validateAccounts } from './config/accounts.map';
import { AccountSettingsController } from './account-settings.controller';
import { AccountSettingsService } from './config/account-settings.service';

@Module({
  imports: [
    PrismaModule,
    // Multer para recibir archivos en memoria (file.buffer) en los controladores
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
      },
    }),
  ],
  controllers: [
    AccountingController,
    // Asegúrate de registrar el export controller para los CSV (incluye los nuevos endpoints de libros)
    AccountingExportController,
    AccountSettingsController,
    // Conciliación bancaria (búsqueda, mark, suggest/apply/undo)
    ReconciliationController,
    // Importación de extractos CSV/Excel
    ImportController,
  ],
  providers: [
    AccountingService,
    AccountSettingsService,
    // Conciliación bancaria
    ReconciliationService,
    MatchingService,
    // Importación de extractos
    ImportService,
  ],
  exports: [
    // Exporta el servicio actualizado para uso en otros módulos
    AccountingService,
    AccountSettingsService,
    ReconciliationService,
    MatchingService,
    ImportService,
  ],
})
export class AccountingModule implements OnModuleInit {
  async onModuleInit() {
    // Valida y crea automáticamente las cuentas faltantes en CoaAccount
    const { created, missing } = await validateAccounts(true);
    if (created > 0) {
      console.log(
        `[AccountingModule] Se crearon ${created} cuentas faltantes en el plan contable.`,
      );
    }
    if (missing.length === 0) {
      console.log(
        '[AccountingModule] Todas las cuentas configuradas en ACCOUNTS están presentes.',
      );
    }
  }
}
