import 'dotenv/config'
import { PrismaClient, AccountClass, FlowType, TaxProfile } from '@prisma/client'

const prisma = new PrismaClient()

// List of essential accounts for payroll flows. These codes exist in puc_full.csv but
// this script will upsert them explicitly in case the CSV hasn't been seeded yet.
const ACCOUNTS = [
  // Expenses (nomina recognition)
  { code: '510506', name: 'SUELDOS', class: AccountClass.EXPENSE, nature: 'D', parentCode: '5105', isDetailed: true },
  { code: '510512', name: 'JORNALES', class: AccountClass.EXPENSE, nature: 'D', parentCode: '5105', isDetailed: true },
  { code: '510515', name: 'HORAS EXTRAS Y RECARGOS', class: AccountClass.EXPENSE, nature: 'D', parentCode: '5105', isDetailed: true },
  { code: '510527', name: 'AUXILIO DE TRANSPORTE', class: AccountClass.EXPENSE, nature: 'D', parentCode: '5105', isDetailed: true },
  { code: '510569', name: 'APORTES A ENTIDADES PROMOTORAS DE SALUD EPS', class: AccountClass.EXPENSE, nature: 'D', parentCode: '5105', isDetailed: true },

  // Payroll liabilities / withholdings / contributions
  { code: '237005', name: 'APORTES A ENTIDADES PROMOTORAS DE SALUD EPS', class: AccountClass.LIABILITY, nature: 'C', parentCode: '2370', isDetailed: true },
  { code: '237010', name: 'APORTES AL I.C.B.F., SENA Y CAJAS DE COMPENSACION', class: AccountClass.LIABILITY, nature: 'C', parentCode: '2370', isDetailed: true },
  { code: '237015', name: 'APORTES AL F.I.C.', class: AccountClass.LIABILITY, nature: 'C', parentCode: '2370', isDetailed: true },
  { code: '237025', name: 'EMBARGOS JUDICIALES', class: AccountClass.LIABILITY, nature: 'C', parentCode: '2370', isDetailed: true },

  // Employee advances (anticipos)
  { code: '133005', name: 'A PROVEEDORES', class: AccountClass.ASSET, nature: 'D', parentCode: '1330', isDetailed: true },
  { code: '133015', name: 'A TRABAJADORES', class: AccountClass.ASSET, nature: 'D', parentCode: '1330', isDetailed: true },

  // Payables / payroll to pay
  { code: '250505', name: 'NÓMINA POR PAGAR', class: AccountClass.LIABILITY, nature: 'C', parentCode: '25', isDetailed: true },
]

async function upsertAccount(a: any) {
  const data = {
    name: a.name,
    nature: a.nature,
    class: a.class,
    current: a.current ?? true,
    reconcilable: a.reconcilable ?? false,
    isBank: a.isBank ?? false,
    isCash: a.isCash ?? false,
    isDetailed: a.isDetailed ?? true,
    parentCode: a.parentCode ?? null,
    requiresThirdParty: a.requiresThirdParty ?? false,
    requiresCostCenter: a.requiresCostCenter ?? false,
    flowType: a.flowType ?? FlowType.NONE,
    taxProfile: a.taxProfile ?? TaxProfile.NA,
  }
  await prisma.coaAccount.upsert({
    where: { code: a.code },
    update: data,
    create: { code: a.code, ...data },
  })
}

async function main() {
  console.log('🔧 Asegurando cuentas PUC esenciales...')
  for (const acc of ACCOUNTS) {
    try {
      await upsertAccount(acc)
      console.log('Upserted', acc.code)
    } catch (err) {
      console.error('Failed upserting', acc.code, err)
    }
  }
  console.log('✅ Hecho')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
