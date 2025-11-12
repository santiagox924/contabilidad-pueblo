// api/src/accounting/config/accounts.map.ts
// Mapa centralizado de cuentas contables usadas por el motor de asientos.
// Ajusta los códigos a tu PUC real.

export const ACCOUNTS = {
  // ——— Tesorería
  cash: '110505', // Caja general
  bank: '11100501', // Banco cuenta corriente principal (COP)
  bankCop: '11100501', // Banco corriente en COP
  bankUsd: '11100502', // Banco corriente en USD

  // ——— Cuentas por cobrar/pagar
  ar: '13050501', // Clientes (CxC) COP
  ap: '220505', // Proveedores (CxP) COP
  arForeign: '13050502', // Clientes en moneda extranjera
  apForeign: '22050502', // Proveedores en moneda extranjera

  // ——— Inventarios, COGS y gastos de compra
  inventory: '143505', // (Inventario) Mercancías no fabricadas por la empresa
  cogs: '613505', // Costo de venta
  purchaseExpense: '513505', // Gastos/Compras cuando no se usa inventario
  productionCost: '613705', // Costos de producción / transformación
  fixedAssetMachinery: '150405', // PPE maquinaria
  fixedAssetIT: '150410', // PPE tecnología
  fixedAssetLeasing: '151605', // Activos en leasing
  accumulatedDepreciationMachinery: '159205', // Depreciación acumulada maquinaria
  accumulatedDepreciationIT: '159210', // Depreciación acumulada TI
  depreciationExpenseMachinery: '516005', // Gasto depreciación maquinaria
  depreciationExpenseIT: '516010', // Gasto depreciación TI
  deferredTaxExpense: '540515', // Gasto impuesto diferido
  deferredTaxAsset: '171005', // Activo por impuesto diferido
  deferredTaxLiability: '251505', // Pasivo por impuesto diferido

  // ——— Ingresos
  salesIncome: '413505', // Ventas de mercancía gravada (sin IVA)
  salesIncomePosStore: '413505', // Ventas POS de mercancía gravada (sin IVA)
  salesIncomePosOnline: '41353002', // Ventas canal online

  // ——— IVA
  salesVat: '240805', // IVA generado por venta
  purchaseVat: '240801', // IVA descontable compras (activo)

  // ——— Resultados por ajustes de inventario
  adjGain: '419505', // Ganancia por variaciones de inventario
  adjLoss: '619505', // Pérdida por variaciones de inventario
  donationExpense: '530505', // Donaciones (gasto extraordinario)
  salesReturns: '417505', // Devoluciones en ventas (contracuenta ingreso)

  // ——— Retenciones
  // Ventas: retenciones sufridas → Activo por cobrar al agente retenedor
  RET_RTF_SALES_ASSET: '135515', // Retefuente en ventas por cobrar
  RET_RICA_SALES_ASSET: '135517', // ReteICA en ventas por cobrar
  RET_RIVA_SALES_ASSET: '135519', // ReteIVA en ventas por cobrar (si aplica)

  // Compras: retenciones practicadas → Pasivo por pagar a la DIAN/ente territorial
  RET_RTF_PURCH_LIAB: '236540', // Retefuente por pagar
  RET_RICA_PURCH_LIAB: '236575', // ReteICA por pagar
  RET_RIVA_PURCH_LIAB: '236580', // ReteIVA por pagar
  RET_RTF_PURCH_LIAB_BOGOTA: '23654001', // Retefuente Bogotá (servicios)
  RET_RTF_PURCH_LIAB_PATRIMONIO: '23654002', // Retefuente patrimonio
  RET_RICA_PURCH_LIAB_BOGOTA: '23657501', // ReteICA Bogotá
  RET_RICA_PURCH_LIAB_MEDELLIN: '23657502', // ReteICA Medellín
  RET_RIVA_PURCH_LIAB_15: '23658001', // ReteIVA 15%
  RET_RIVA_PURCH_LIAB_50: '23658002', // ReteIVA 50%

  // ——— Cierre anual
  yearResult: '360505', // Resultado del ejercicio (36)
  retainedEarningsProfit: '370505', // Utilidades acumuladas (patrimonio)
  retainedEarningsLoss: '370510', // Pérdidas acumuladas (patrimonio)
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

const ACCOUNT_LABELS: Partial<Record<AccountKey, string>> = {
  cash: 'Caja general',
  bank: 'Cuenta corriente principal',
  ar: 'Clientes nacionales (CxC)',
  adjGain: 'Ganancia por variaciones de inventario',
  adjLoss: 'Pérdida por variaciones de inventario',
  salesIncome: 'Ventas de mercancía gravada',
  salesIncomePosStore: 'Ventas POS de mercancía gravada',
  salesIncomePosOnline: 'Ventas online gravadas',
  salesVat: 'IVA generado por venta',
  cogs: 'Costo de venta',
  inventory: '(Inventario) Mercancías no fabricadas por la empresa',
};

const ACCOUNT_LEGACY_NAMES: Partial<Record<AccountKey, string[]>> = {
  cash: ['cash', 'Caja general'],
  bank: ['bank', 'Banco cuenta corriente principal'],
  ar: ['ar', 'Accounts receivable', 'Cuentas por cobrar clientes'],
  salesIncome: [
    'salesIncome',
    'Venta de mercancías gravadas sin IVA',
    'Venta de mercancías gravadas',
  ],
  salesIncomePosStore: [
    'salesIncomePosStore',
    'Venta POS de mercancías gravadas sin IVA',
    'Venta POS de mercancías gravadas',
  ],
  salesIncomePosOnline: ['salesIncomePosOnline'],
  salesVat: [
    'salesVat',
    'IVA generado por ventas (pasivo)',
    'IVA generado 19%',
    'IVA generado por ventas 19% sobre la base',
  ],
  cogs: [
    'cogs',
    'Costo de ventas (mercancías)',
    'Costo de mercancías vendidas',
  ],
  inventory: [
    'inventory',
    'Inventarios terminados',
    'Mercancías no fabricadas por la empresa',
  ],
  adjGain: ['adjGain', 'Ganancia por variaciones de inventario'],
  adjLoss: ['adjLoss', 'Pérdida por variaciones de inventario'],
};

// ——— Validación/auto-seed al arrancar la app
import { PrismaClient, AccountClass } from '@prisma/client';

type Nature = 'D' | 'C';

/**
 * Inferimos naturaleza contable por el primer dígito (ajústalo a tu PUC si lo necesitas):
 * 1 Activo (D), 2 Pasivo (C), 3 Patrimonio (C), 4 Ingreso (C), 5/6 Gasto/Costos (D).
 */
function inferNatureFromCode(code: string): Nature {
  const first = code?.[0];
  if (first === '1' || first === '5' || first === '6') return 'D';
  if (first === '2' || first === '3' || first === '4') return 'C';
  return 'D';
}

/**
 * Inferimos la clase de cuenta según el primer dígito.
 * Usamos el enum generado: AccountClass.{ASSET|LIABILITY|EQUITY|INCOME|EXPENSE}
 */
function inferClassFromCode(code: string): AccountClass {
  const first = code?.[0];
  if (first === '1') return AccountClass.ASSET;
  if (first === '2') return AccountClass.LIABILITY;
  if (first === '3') return AccountClass.EQUITY;
  if (first === '4') return AccountClass.INCOME;
  if (first === '5' || first === '6') return AccountClass.EXPENSE;
  return AccountClass.EXPENSE;
}

/**
 * Verifica que todas las cuentas de ACCOUNTS existan en CoaAccount.
 * Si faltan, las crea automáticamente con valores por defecto seguros.
 * Devuelve un pequeño resumen por si quieres loguearlo desde el módulo.
 */
export async function validateAccounts(
  autoSeed = true,
): Promise<{ created: number; missing: string[] }> {
  const prisma = new PrismaClient();
  const entries = Object.entries(ACCOUNTS) as [AccountKey, string][];
  const missing: string[] = [];
  let created = 0;

  try {
    for (const [key, code] of entries) {
      let exists = await prisma.coaAccount.findUnique({ where: { code } });
      const preferredName = ACCOUNT_LABELS[key] ?? String(key);
      const legacyNames = ACCOUNT_LEGACY_NAMES[key] ?? [String(key)];
      if (!exists) {
        missing.push(code);
        if (autoSeed) {
          await prisma.coaAccount.create({
            data: {
              code,
              name: preferredName,
              nature: inferNatureFromCode(code),
              isDetailed: true, // permite movimientos directos por defecto
              requiresThirdParty: false,
              requiresCostCenter: false,
              class: inferClassFromCode(code), // <- obligatorio
              // Si tu modelo tiene más columnas (p. ej. isActive), puedes agregarlas aquí:
              // isActive: true,
            },
          });
          created++;
          console.log(`[ACCOUNTS] Creada cuenta faltante ${code} (${key})`);
        }
        continue;
      }

      if (
        preferredName !== exists.name &&
        legacyNames.includes((exists.name ?? '').trim())
      ) {
        await prisma.coaAccount.update({
          where: { code },
          data: { name: preferredName },
        });
        exists = await prisma.coaAccount.findUnique({ where: { code } });
      }

      if (key === 'cogs' && exists?.requiresCostCenter) {
        await prisma.coaAccount.update({
          where: { code },
          data: { requiresCostCenter: false },
        });
      }
    }
    // Si no queremos autoSeed y faltan cuentas, fallamos
    if (!autoSeed && missing.length) {
      throw new Error(`Faltan cuentas en CoA: ${missing.join(', ')}`);
    }
    return { created, missing };
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
