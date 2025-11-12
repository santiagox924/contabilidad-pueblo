// prisma/seed.ts
import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'csv-parse/sync'
import {
  PrismaClient,
  Prisma,
  UnitKind,
  Unit,
  ItemType,
  PartyType,
  PaymentType,
  InstallmentFrequency,
  StockMoveType,
  AccountClass,
  FlowType,
  TaxProfile,
  FiscalRegime,
  WithholdingType,
  RuleScope,
  TaxKind,
  RoundingMode,
  UserRoleCode,
} from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { convertToBase } from '../src/common/units'

const prisma = new PrismaClient()

const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMINISTRATOR: 'ADMINISTRATOR',
  ACCOUNTING_ADMIN: 'ACCOUNTING_ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  ACCOUNTING_ASSISTANT: 'ACCOUNTING_ASSISTANT',
  AUDITOR: 'AUDITOR',
  TREASURY: 'TREASURY',
  PURCHASING: 'PURCHASING',
  SALES: 'SALES',
  INVENTORY: 'INVENTORY',
  COST: 'COST',
  HR: 'HR',
  EXTERNAL_AUDITOR: 'EXTERNAL_AUDITOR',
} satisfies Record<string, UserRoleCode>

const FISCAL_OBLIGATION = {
  VAT: 'VAT',
  RETEFUENTE: 'RETEFUENTE',
  RETEIVA: 'RETEIVA',
  RETEICA: 'RETEICA',
  ELECTRONIC_INVOICE: 'ELECTRONIC_INVOICE',
  ELECTRONIC_PAYROLL: 'ELECTRONIC_PAYROLL',
  EXOGENA: 'EXOGENA',
} as const

const FISCAL_PERIODICITY = {
  MONTHLY: 'MONTHLY',
  BIMONTHLY: 'BIMONTHLY',
  ANNUAL: 'ANNUAL',
  EVENT_BASED: 'EVENT_BASED',
} as const

const DIAN_ENVIRONMENT = {
  TEST: 'TEST',
  PRODUCTION: 'PRODUCTION',
} as const

// ---------- Helpers de fechas / números ----------
function addMonths(d: Date, m: number) {
  const x = new Date(d)
  x.setMonth(x.getMonth() + m)
  return x
}
function addDays(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
function splitEven(total: number, n: number) {
  const base = round2(total / n)
  const arr = Array(n).fill(base)
  const sum = round2(arr.reduce((a, b) => a + b, 0))
  const diff = round2(total - sum)
  arr[n - 1] = round2(arr[n - 1] + diff)
  return arr
}

const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 5, 0, 0))

// ---------- Helpers de dominio ----------
type SalesLineInput = { qty: number; unitPrice?: number; vatPct?: number }
type PurchaseLineInput = { qty: number; unitCost?: number; vatPct?: number }

function calcSales(lines: SalesLineInput[]) {
  const lineTotals = lines.map((l) => {
    const sub = round2((l.unitPrice ?? 0) * l.qty)
    const vat = round2(sub * ((l.vatPct ?? 0) / 100))
    const tot = round2(sub + vat)
    return { sub, vat, tot }
  })
  const subtotal = round2(lineTotals.reduce((a, b) => a + b.sub, 0))
  const tax = round2(lineTotals.reduce((a, b) => a + b.vat, 0))
  const total = round2(lineTotals.reduce((a, b) => a + b.tot, 0))
  return { subtotal, tax, total, lineTotals }
}

function calcPurchase(lines: PurchaseLineInput[]) {
  const lineTotals = lines.map((l) => {
    const sub = round2((l.unitCost ?? 0) * l.qty)
    const vat = round2(sub * ((l.vatPct ?? 0) / 100))
    const tot = round2(sub + vat)
    return { sub, vat, tot }
  })
  const subtotal = round2(lineTotals.reduce((a, b) => a + b.sub, 0))
  const tax = round2(lineTotals.reduce((a, b) => a + b.vat, 0))
  const total = round2(lineTotals.reduce((a, b) => a + b.tot, 0))
  return { subtotal, tax, total, lineTotals }
}

async function ensureStockMoveByNote(params: {
  itemId: number
  warehouseId: number
  type: StockMoveType
  qty: number
  uom: Unit
  unitCost: number
  note: string
  refType?: string
  refId?: number
}) {
  // Normalize qty and unitCost to the item's base unit so seed data matches runtime
  const item = await prisma.item.findUnique({ where: { id: params.itemId }, select: { baseUnit: true } })
  const baseUnit = item?.baseUnit
  const qtyBase = baseUnit ? convertToBase(params.qty, params.uom, baseUnit) : params.qty
  const factor = baseUnit ? convertToBase(1, params.uom, baseUnit) : 1
  const unitCostBase = factor > 0 ? Number(params.unitCost) / factor : params.unitCost

  const exists = await prisma.stockMove.findFirst({ where: { note: params.note } })
  if (!exists) {
    await prisma.stockMove.create({
      data: {
        itemId: params.itemId,
        warehouseId: params.warehouseId,
        type: params.type,
        qty: qtyBase as any,
        uom: (baseUnit ?? params.uom) as any,
        unitCost: unitCostBase as any,
        refType: params.refType ?? null,
        refId: params.refId ?? null,
        note: params.note,
      },
    })
    return
  }

  const updates: Prisma.StockMoveUpdateInput = {}

  if (exists.type !== params.type) updates.type = params.type
  if (!exists.qty.equals(qtyBase)) updates.qty = qtyBase as any
  if (exists.uom !== (baseUnit ?? params.uom)) updates.uom = (baseUnit ?? params.uom) as any
  if (!exists.unitCost.equals(unitCostBase)) updates.unitCost = unitCostBase as any
  if (exists.refType !== (params.refType ?? null)) updates.refType = params.refType ?? null
  if (exists.refId !== (params.refId ?? null)) updates.refId = params.refId ?? null

  if (Object.keys(updates).length > 0) {
    await prisma.stockMove.update({ where: { id: exists.id }, data: updates })
  }

  const unitCostChanged = !exists.unitCost.equals(unitCostBase)
  if (unitCostChanged) {
    await prisma.stockLayer.updateMany({ where: { moveInId: exists.id }, data: { unitCost: unitCostBase as any } })
    await prisma.stockConsumption.updateMany({ where: { layer: { moveInId: exists.id } }, data: { unitCost: unitCostBase as any } })
  }
}

async function createInstallmentsForARIfMissing(
  receivableId: number,
  total: number,
  installments: number,
  freq: InstallmentFrequency,
  startDate: Date,
) {
  const amounts = splitEven(total, installments)
  for (let i = 0; i < installments; i++) {
    const dueDate = freq === 'MONTHLY' ? addMonths(startDate, i) : addDays(startDate, 15 * i)
    const existing = await prisma.installment.findFirst({
      where: { receivableId, number: i + 1 },
    })
    if (!existing) {
      await prisma.installment.create({
        data: { receivableId, number: i + 1, dueDate, amount: amounts[i] },
      })
    }
  }
}

async function createInstallmentsForAPIfMissing(
  payableId: number,
  total: number,
  installments: number,
  freq: InstallmentFrequency,
  startDate: Date,
) {
  const amounts = splitEven(total, installments)
  for (let i = 0; i < installments; i++) {
    const dueDate = freq === 'MONTHLY' ? addMonths(startDate, i) : addDays(startDate, 15 * i)
    const existing = await prisma.installment.findFirst({
      where: { payableId, number: i + 1 },
    })
    if (!existing) {
      await prisma.installment.create({
        data: { payableId, number: i + 1, dueDate, amount: amounts[i] },
      })
    }
  }
}

// ---------- Periodo contable ----------
async function ensureOpenAccountingPeriod(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  const p = await prisma.accountingPeriod.findFirst({ where: { year, month } })
  if (!p) {
    await prisma.accountingPeriod.create({
      data: { year, month, start: new Date(year, month - 1, 1), end: new Date(year, month, 0) },
    })
  } else if (p.closedAt) {
    await prisma.accountingPeriod.update({
      where: { id: p.id },
      data: { closedAt: null, reopenedAt: new Date() },
    })
  }
}

// ---------- Admin por defecto ----------
async function ensureAdminUser() {
  const email = 'admin@local.com'
  const plain = '12345678'
  const hash = bcrypt.hashSync(plain, 10)

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash: hash as any } as any,
    create: { email, passwordHash: hash as any } as any,
  })

  const admin = await prisma.user.findUnique({ where: { email } })
  if (admin) {
    const desiredRoles: UserRoleCode[] = [
      USER_ROLES.SUPER_ADMIN,
      USER_ROLES.ADMINISTRATOR,
      USER_ROLES.ACCOUNTING_ADMIN,
      USER_ROLES.ACCOUNTANT,
      USER_ROLES.TREASURY,
    ]
    await Promise.all(
      desiredRoles.map((role) =>
        prisma.userRole.upsert({
          where: {
            userId_role: {
              userId: admin.id,
              role,
            },
          },
          update: {},
          create: { userId: admin.id, role },
        }),
      ),
    )
  }
  console.log(`👤 Usuario admin listo: ${email} / ${plain}`)
}

// ---------- Plan de cuentas ----------
type CoaSeed = {
  code: string
  name: string
  nature: 'D' | 'C'
  class: AccountClass
  current?: boolean
  reconcilable?: boolean
  isBank?: boolean
  isCash?: boolean
  isDetailed?: boolean
  parentCode?: string | null
  requiresThirdParty?: boolean
  requiresCostCenter?: boolean
  flowType?: FlowType
  taxProfile?: TaxProfile
  vatRate?: number | null
  defaultCurrency?: string | null
}

const FALLBACK_COA: CoaSeed[] = [
  { code: '11', name: 'Disponible', nature: 'D', class: AccountClass.ASSET, current: true, isDetailed: false },
  {
    code: '1105',
    name: 'Caja',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isCash: true,
    reconcilable: false,
    parentCode: '11',
  },
  {
    code: '110505',
    name: 'Caja general',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isCash: true,
    reconcilable: false,
    isDetailed: true,
    parentCode: '1105',
  },
  {
    code: '1110',
    name: 'Bancos',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isBank: true,
    reconcilable: true,
    parentCode: '11',
  },
  {
    code: '111005',
    name: 'Cuenta corriente - moneda nacional',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isBank: true,
    reconcilable: true,
    isDetailed: false,
    parentCode: '1110',
  },
  {
    code: '11100501',
    name: 'Cuenta corriente principal COP',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isBank: true,
    reconcilable: true,
    isDetailed: true,
    parentCode: '111005',
    defaultCurrency: 'COP',
  },
  {
    code: '11100502',
    name: 'Cuenta corriente internacional USD',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isBank: true,
    reconcilable: true,
    isDetailed: true,
    parentCode: '111005',
    defaultCurrency: 'USD',
  },
  { code: '17', name: 'Activos diferidos y anticipos', nature: 'D', class: AccountClass.ASSET, current: true, isDetailed: false },
  {
    code: '1710',
    name: 'Impuesto diferido',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    parentCode: '17',
  },
  {
    code: '171005',
    name: 'Impuesto diferido activo',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isDetailed: true,
    parentCode: '1710',
  },
  { code: '13', name: 'Deudores', nature: 'D', class: AccountClass.ASSET, current: true, isDetailed: false },
  {
    code: '1305',
    name: 'Clientes (CxC)',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AR,
    parentCode: '13',
  },
  {
    code: '130505',
    name: 'Clientes nacionales',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AR,
    isDetailed: false,
    parentCode: '1305',
  },
  {
    code: '13050501',
    name: 'Clientes nacionales COP',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AR,
    isDetailed: true,
    parentCode: '130505',
    defaultCurrency: 'COP',
  },
  {
    code: '13050502',
    name: 'Clientes exterior USD',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AR,
    isDetailed: true,
    parentCode: '130505',
    defaultCurrency: 'USD',
  },
  { code: '14', name: 'Inventarios', nature: 'D', class: AccountClass.ASSET, current: true, isDetailed: false },
  {
    code: '1435',
    name: 'Inventarios mercancías',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    parentCode: '14',
  },
  {
    code: '143505',
    name: '(Inventario) Mercancías no fabricadas por la empresa',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isDetailed: true,
    parentCode: '1435',
  },
  { code: '15', name: 'Propiedad, planta y equipo', nature: 'D', class: AccountClass.ASSET, isDetailed: false },
  {
    code: '1504',
    name: 'Maquinaria y equipo',
    nature: 'D',
    class: AccountClass.ASSET,
    parentCode: '15',
    isDetailed: false,
  },
  {
    code: '150405',
    name: 'Equipo de producción',
    nature: 'D',
    class: AccountClass.ASSET,
    isDetailed: true,
    parentCode: '1504',
  },
  {
    code: '150410',
    name: 'Equipo de cómputo y comunicaciones',
    nature: 'D',
    class: AccountClass.ASSET,
    isDetailed: true,
    parentCode: '1504',
  },
  {
    code: '1516',
    name: 'Activos en leasing financiero',
    nature: 'D',
    class: AccountClass.ASSET,
    parentCode: '15',
    isDetailed: false,
  },
  {
    code: '151605',
    name: 'Leasing maquinaria',
    nature: 'D',
    class: AccountClass.ASSET,
    isDetailed: true,
    parentCode: '1516',
  },
  {
    code: '1592',
    name: 'Depreciación acumulada - propiedad planta y equipo',
    nature: 'C',
    class: AccountClass.ASSET,
    parentCode: '15',
    isDetailed: false,
  },
  {
    code: '159205',
    name: 'Depreciación acumulada equipo de producción',
    nature: 'C',
    class: AccountClass.ASSET,
    isDetailed: true,
    parentCode: '1592',
  },
  {
    code: '159210',
    name: 'Depreciación acumulada equipo de cómputo',
    nature: 'C',
    class: AccountClass.ASSET,
    isDetailed: true,
    parentCode: '1592',
  },
  {
    code: '1355',
    name: 'IVA descontable (compras)',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    taxProfile: TaxProfile.IVA_RESPONSABLE,
    vatRate: 19,
    parentCode: '13',
  },
  {
    code: '135530',
    name: 'IVA descontable',
    nature: 'D',
    class: AccountClass.ASSET,
    current: true,
    isDetailed: true,
    taxProfile: TaxProfile.IVA_RESPONSABLE,
    vatRate: 19,
    parentCode: '1355',
  },
  { code: '24', name: 'Impuestos por pagar', nature: 'C', class: AccountClass.LIABILITY, current: true, isDetailed: false },
  {
    code: '2408',
    name: 'IVA generado (ventas)',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    taxProfile: TaxProfile.IVA_RESPONSABLE,
    vatRate: 19,
    parentCode: '24',
  },
  {
    code: '240805',
    name: 'IVA generado por venta',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    isDetailed: true,
    taxProfile: TaxProfile.IVA_RESPONSABLE,
    vatRate: 19,
    parentCode: '2408',
  },
  { code: '2365', name: 'ReteFUENTE por pagar', nature: 'C', class: AccountClass.LIABILITY, current: true, parentCode: '24', isDetailed: false },
  {
    code: '236540',
    name: 'Retefuente servicios nacionales',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '2365',
    isDetailed: false,
  },
  {
    code: '23654001',
    name: 'Retefuente Bogotá (servicios)',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236540',
    isDetailed: true,
  },
  {
    code: '23654002',
    name: 'Retefuente patrimonio (dividendos)',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236540',
    isDetailed: true,
  },
  { code: '25', name: 'Impuestos diferidos', nature: 'C', class: AccountClass.LIABILITY, current: true, isDetailed: false },
  {
    code: '2515',
    name: 'Impuesto diferido',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '25',
  },
  {
    code: '251505',
    name: 'Impuesto diferido pasivo',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    isDetailed: true,
    parentCode: '2515',
  },
  { code: '2368', name: 'ReteICA por pagar', nature: 'C', class: AccountClass.LIABILITY, current: true, parentCode: '24', isDetailed: false },
  {
    code: '236575',
    name: 'ReteICA industria y comercio',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '2368',
    isDetailed: false,
  },
  {
    code: '23657501',
    name: 'ReteICA Bogotá',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236575',
    isDetailed: true,
  },
  {
    code: '23657502',
    name: 'ReteICA Medellín',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236575',
    isDetailed: true,
  },
  { code: '2369', name: 'ReteIVA por pagar', nature: 'C', class: AccountClass.LIABILITY, current: true, parentCode: '24', isDetailed: false },
  {
    code: '236580',
    name: 'ReteIVA nacional',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '2369',
    isDetailed: false,
  },
  {
    code: '23658001',
    name: 'ReteIVA 15%',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236580',
    isDetailed: true,
  },
  {
    code: '23658002',
    name: 'ReteIVA 50%',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    parentCode: '236580',
    isDetailed: true,
  },
  { code: '22', name: 'Proveedores y CxP', nature: 'C', class: AccountClass.LIABILITY, current: true, isDetailed: false },
  {
    code: '2205',
    name: 'Proveedores (CxP)',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AP,
    parentCode: '22',
  },
  {
    code: '220505',
    name: 'Proveedores nacionales',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AP,
    isDetailed: true,
    defaultCurrency: 'COP',
    parentCode: '2205',
  },
  {
    code: '22050502',
    name: 'Proveedores exterior USD',
    nature: 'C',
    class: AccountClass.LIABILITY,
    current: true,
    requiresThirdParty: true,
    reconcilable: true,
    flowType: FlowType.AP,
    isDetailed: true,
    parentCode: '2205',
    defaultCurrency: 'USD',
  },
  { code: '31', name: 'Patrimonio', nature: 'C', class: AccountClass.EQUITY, isDetailed: false },
  { code: '3115', name: 'Capital', nature: 'C', class: AccountClass.EQUITY, parentCode: '31' },
  { code: '41', name: 'Ingresos operacionales', nature: 'C', class: AccountClass.INCOME, isDetailed: false },
  { code: '4135', name: 'Ingresos por ventas', nature: 'C', class: AccountClass.INCOME, parentCode: '41' },
  {
    code: '413530',
    name: 'Venta de productos elaborados',
    nature: 'C',
    class: AccountClass.INCOME,
    isDetailed: false,
    parentCode: '4135',
  },
  {
    code: '41353001',
    name: 'Ventas POS tienda física',
    nature: 'C',
    class: AccountClass.INCOME,
    isDetailed: true,
    parentCode: '413530',
  },
  {
    code: '41353002',
    name: 'Ventas POS canal online',
    nature: 'C',
    class: AccountClass.INCOME,
    isDetailed: true,
    parentCode: '413530',
  },
  { code: '4195', name: 'Recuperaciones de inventarios', nature: 'C', class: AccountClass.INCOME, parentCode: '41' },
  {
    code: '419505',
    name: 'Ganancia por variaciones de inventario',
    nature: 'C',
    class: AccountClass.INCOME,
    isDetailed: true,
    parentCode: '4195',
  },
  { code: '51', name: 'Gastos operacionales', nature: 'D', class: AccountClass.EXPENSE, isDetailed: false },
  { code: '5105', name: 'Gastos varios', nature: 'D', class: AccountClass.EXPENSE, parentCode: '51' },
  { code: '5135', name: 'Servicios', nature: 'D', class: AccountClass.EXPENSE, parentCode: '51' },
  {
    code: '513505',
    name: 'Servicios (compras sin inventario)',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '5135',
  },
  {
    code: '5160',
    name: 'Gastos por depreciaciones',
    nature: 'D',
    class: AccountClass.EXPENSE,
    parentCode: '51',
  },
  {
    code: '516005',
    name: 'Depreciación equipo de producción',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '5160',
  },
  {
    code: '516010',
    name: 'Depreciación equipo de cómputo',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '5160',
  },
  { code: '54', name: 'Gastos no operacionales', nature: 'D', class: AccountClass.EXPENSE, isDetailed: false },
  {
    code: '5405',
    name: 'Impuesto de renta y complementarios',
    nature: 'D',
    class: AccountClass.EXPENSE,
    parentCode: '54',
  },
  {
    code: '540515',
    name: 'Gasto impuesto diferido',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '5405',
  },
  { code: '61', name: 'Costos de ventas', nature: 'D', class: AccountClass.EXPENSE, isDetailed: false },
  { code: '6135', name: 'Costo de ventas', nature: 'D', class: AccountClass.EXPENSE, parentCode: '61' },
  {
    code: '613505',
    name: 'Costo de venta',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '6135',
  },
  { code: '6137', name: 'Costos de transformación', nature: 'D', class: AccountClass.EXPENSE, parentCode: '61' },
  {
    code: '613705',
    name: 'Costos de producción / transformación',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '6137',
  },
  { code: '6195', name: 'Variación de inventarios', nature: 'D', class: AccountClass.EXPENSE, parentCode: '61' },
  {
    code: '619505',
    name: 'Pérdida por variaciones de inventario',
    nature: 'D',
    class: AccountClass.EXPENSE,
    isDetailed: true,
    parentCode: '6195',
  },
  { code: '47', name: 'Ingresos no operacionales', nature: 'C', class: AccountClass.INCOME, isDetailed: false },
  { code: '4705', name: 'Ingresos por ajustes', nature: 'C', class: AccountClass.INCOME, parentCode: '47' },
  { code: '5199', name: 'Pérdidas por ajustes', nature: 'D', class: AccountClass.EXPENSE, parentCode: '51' },
]

function parseBoolean(value: any): boolean | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return undefined
  if (['true', '1', 'yes', 'y', 'si', 'sí'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return undefined
}

function parseNumberFromCsv(value: any): number | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value ?? '')
    .trim()
    .replace(/,/g, '.')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

type MunicipalitySeed = {
  code: string
  departmentCode: string
  departmentName: string
  name: string
  type: string
  latitude: number | null
  longitude: number | null
}

const MUNICIPALITY_CSV_CANDIDATES = [
  'DIVIPOLA-_Códigos_municipios_20251013.csv',
  'DIVIPOLA_CODIGOS_MUNICIPIOS.csv',
  'DIVIPOLA_municipios.csv',
]

function normalizeMunicipalityString(value: any): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickRowValue(row: Record<string, unknown>, keys: string[]): any {
  for (const key of keys) {
    if (key in row && row[key] !== undefined && row[key] !== null) {
      return row[key]
    }
  }
  return undefined
}

function loadMunicipalitySeedsFromCsv(filePath: string): MunicipalitySeed[] {
  if (!existsSync(filePath)) return []
  const raw = readFileSync(filePath, 'utf8')
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[]

  return records
    .map((row) => {
      const deptCodeRaw = pickRowValue(row, [
        'Código Departamento',
        'Codigo Departamento',
        'codigo_departamento',
        'departmentCode',
        'department_code',
      ])
      const deptNameRaw = pickRowValue(row, [
        'Nombre Departamento',
        'nombre departamento',
        'nombre_departamento',
        'departmentName',
      ])
      const codeRaw = pickRowValue(row, [
        'Código Municipio',
        'Codigo Municipio',
        'codigo_municipio',
        'municipio_codigo',
        'municipalityCode',
      ])
      const nameRaw = pickRowValue(row, [
        'Nombre Municipio',
        'nombre municipio',
        'municipio_nombre',
        'municipalityName',
      ])
      const typeRaw = pickRowValue(row, [
        'Tipo: Municipio / Isla / Área no municipalizada',
        'Tipo',
        'tipo',
        'kind',
      ])
      const latRaw = pickRowValue(row, ['Latitud', 'latitud', 'latitude'])
      const lonRaw = pickRowValue(row, ['longitud', 'Longitud', 'longitude'])

      const deptCode = normalizeMunicipalityString(deptCodeRaw ?? '')
      const code = normalizeMunicipalityString(codeRaw ?? '')
      const name = normalizeMunicipalityString(nameRaw ?? '')
      const deptName = normalizeMunicipalityString(deptNameRaw ?? '')

      if (!deptCode || !code || !name) return null

      const latitude = parseNumberFromCsv(latRaw)
      const longitude = parseNumberFromCsv(lonRaw)

      return {
        code: code.padStart(5, '0'),
        departmentCode: deptCode.padStart(2, '0'),
        departmentName: deptName || 'SIN DEPTO',
        name,
        type: normalizeMunicipalityString(typeRaw ?? '') || 'Municipio',
        latitude: latitude ?? null,
        longitude: longitude ?? null,
      }
    })
    .filter((row): row is MunicipalitySeed => row !== null)
}

async function seedMunicipalities() {
  let seeds: MunicipalitySeed[] = []
  for (const candidate of MUNICIPALITY_CSV_CANDIDATES) {
    const filePath = path.join(__dirname, candidate)
    const rows = loadMunicipalitySeedsFromCsv(filePath)
    if (rows.length) {
      seeds = rows
      break
    }
  }

  if (!seeds.length) {
    console.warn('⚠️  No se encontró CSV de municipios DIVIPOLA; omitiendo carga.')
    return
  }

  await prisma.municipality.deleteMany({})

  const chunkSize = 500
  for (let i = 0; i < seeds.length; i += chunkSize) {
    const chunk = seeds.slice(i, i + chunkSize)
    if (!chunk.length) continue
    await prisma.municipality.createMany({
      data: chunk.map((m) => ({
        code: m.code,
        departmentCode: m.departmentCode,
        departmentName: m.departmentName,
        name: m.name,
        type: m.type,
        latitude: m.latitude,
        longitude: m.longitude,
      })),
      skipDuplicates: true,
    })
  }

  console.log(`🌎 Municipios DIVIPOLA cargados (${seeds.length})`)
}

function sanitizeCode(value: any): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '')
}

function sanitizeName(value: any): string {
  const name = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return name || 'Cuenta sin nombre'
}

function parseNature(value: any): 'D' | 'C' {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return normalized === 'C' ? 'C' : 'D'
}

function deriveClassFromCode(code: string): AccountClass {
  const first = code.trim()[0]
  switch (first) {
    case '1':
      return AccountClass.ASSET
    case '2':
      return AccountClass.LIABILITY
    case '3':
      return AccountClass.EQUITY
    case '4':
      return AccountClass.INCOME
    case '5':
    case '6':
    case '7':
      return AccountClass.EXPENSE
    default:
      return AccountClass.EXPENSE
  }
}

function parseFlowTypeValue(value: any): FlowType | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return undefined
  return (Object.values(FlowType) as string[]).includes(normalized) ? (normalized as FlowType) : undefined
}

function parseTaxProfileValue(value: any): TaxProfile | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  if (!normalized) return undefined
  return (Object.values(TaxProfile) as string[]).includes(normalized) ? (normalized as TaxProfile) : undefined
}

function normalizeCsvRow(row: Record<string, any>): Record<string, any> {
  const normalized: Record<string, any> = {}
  for (const [rawKey, value] of Object.entries(row)) {
    const key = rawKey.replace(/\uFEFF/g, '').trim()
    normalized[key] = value
  }
  return normalized
}

function loadCoaSeedsFromCsv(filePath: string): CoaSeed[] {
  if (!existsSync(filePath)) return []
  const csv = readFileSync(filePath, 'utf8')
  const records: Record<string, any>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
  })
  return records
    .map((row) => {
      const normalizedRow = normalizeCsvRow(row)
      const code = sanitizeCode(normalizedRow.code)
      if (!code) return null
      const parentCode = sanitizeCode(normalizedRow.parentCode)
      const classText = String(normalizedRow.class ?? '')
        .trim()
        .toUpperCase()
      const accountClass = (Object.values(AccountClass) as string[]).includes(classText)
        ? (classText as AccountClass)
        : deriveClassFromCode(code)
      const flowType = parseFlowTypeValue(normalizedRow.flowType)
      const taxProfile = parseTaxProfileValue(normalizedRow.taxProfile)
      const isDetailed = parseBoolean(normalizedRow.isDetailed)

      const seed: CoaSeed = {
        code,
        name: sanitizeName(normalizedRow.name),
        nature: parseNature(normalizedRow.nature),
        class: accountClass,
        current: parseBoolean(normalizedRow.current),
        reconcilable: parseBoolean(normalizedRow.reconcilable),
        isBank: parseBoolean(normalizedRow.isBank),
        isCash: parseBoolean(normalizedRow.isCash),
        isDetailed: isDetailed === undefined ? (parentCode ? true : false) : isDetailed,
        parentCode: parentCode || null,
        requiresThirdParty: parseBoolean(normalizedRow.requiresThirdParty),
        requiresCostCenter: parseBoolean(normalizedRow.requiresCostCenter),
        flowType,
        taxProfile,
      }

      const vatRate = parseNumberFromCsv(normalizedRow.vatRate)
      if (vatRate !== undefined) seed.vatRate = vatRate

      const defaultCurrencyRaw = normalizedRow.defaultCurrency
      if (defaultCurrencyRaw !== undefined && defaultCurrencyRaw !== null) {
        const currency = String(defaultCurrencyRaw).trim().toUpperCase()
        if (currency) seed.defaultCurrency = currency
      }

      return seed
    })
    .filter((row): row is CoaSeed => row !== null)
}

async function upsertCoaAccount(a: CoaSeed) {
  const data = {
    name: a.name,
    nature: a.nature,
    class: a.class,
    current: !!a.current,
    reconcilable: !!a.reconcilable,
    isBank: !!a.isBank,
    isCash: !!a.isCash,
    isDetailed: a.isDetailed ?? true,
    parentCode: a.parentCode ?? null,
    requiresThirdParty: !!a.requiresThirdParty,
    requiresCostCenter: !!a.requiresCostCenter,
    flowType: a.flowType ?? FlowType.NONE,
    taxProfile: a.taxProfile ?? TaxProfile.NA,
    vatRate: a.vatRate ?? null,
    defaultCurrency: a.defaultCurrency ?? null,
  }
  await prisma.coaAccount.upsert({
    where: { code: a.code },
    update: data,
    create: { code: a.code, ...data },
  })
}

async function seedChartOfAccounts() {
  const csvCandidates = ['puc_full.csv']
  let seeds: CoaSeed[] = []
  for (const candidate of csvCandidates) {
    const candidatePath = path.join(__dirname, candidate)
    const rows = loadCoaSeedsFromCsv(candidatePath)
    if (rows.length) {
      seeds = rows
      break
    }
  }

  if (!seeds.length) seeds = FALLBACK_COA

  const seedCodeSet = new Set(seeds.map((s) => s.code))

  const staleAccounts = await prisma.coaAccount.findMany({
    where: {
      code: { notIn: Array.from(seedCodeSet) },
      journalLines: { none: {} },
    },
    select: { id: true, code: true },
  })

  if (staleAccounts.length) {
    for (const stale of staleAccounts) {
      await prisma.coaAccount.delete({ where: { id: stale.id } })
    }
    const removedCodes = staleAccounts.map((s) => s.code).join(', ')
    console.log(`🧹 Cuentas obsoletas eliminadas: ${removedCodes}`)
  }

  for (const seed of seeds) await upsertCoaAccount(seed)
  console.log(`📚 Plan de cuentas listo (${seeds.length} cuentas)`)
}

// ---------- Impuestos y Retenciones ----------
async function seedTaxes() {
  const vatCatalog = [
    { code: 'IVA0', name: 'IVA 0% (Exento)', ratePct: 0 },
    { code: 'IVA5', name: 'IVA 5% (Canasta familiar)', ratePct: 5 },
    { code: 'IVA19', name: 'IVA 19% (Tarifa general)', ratePct: 19 },
  ]

  for (const tax of vatCatalog) {
    await prisma.tax.upsert({
      where: { code: tax.code },
      update: { name: tax.name, ratePct: tax.ratePct, kind: TaxKind.VAT, active: true },
      create: { ...tax, kind: TaxKind.VAT, active: true },
    })
  }
}

async function seedWithholdingRules() {
  const UVT_2025 = 47065
  const toCOP = (uvt: number) => Math.round(uvt * UVT_2025)

  type WithholdingSeed = {
    id: number
    type: WithholdingType
    scope: RuleScope
    ratePct: number
    minBase?: number
    fixedAmount?: number | null
    ciiuCode?: string | null
    municipalityCode?: string | null
    onlyForAgents?: boolean
    segments?: {
      municipalityCode?: string | null
      departmentCode?: string | null
      validFrom?: string | Date | null
      validTo?: string | Date | null
      minBase?: number | null
      maxBase?: number | null
      ratePct?: number | null
      fixedAmount?: number | null
    }[]
  }

  const rules: WithholdingSeed[] = [
    {
      id: 1,
      type: WithholdingType.RTF,
      scope: RuleScope.PURCHASES,
      ratePct: 2.5,
      minBase: toCOP(27), // 27 UVT ~ compras de mercancías
      ciiuCode: '4721',
      municipalityCode: '11001',
      onlyForAgents: false,
      segments: [
        {
          municipalityCode: '11001',
          validFrom: '2025-01-01',
          ratePct: 2.5,
          minBase: toCOP(27),
        },
      ],
    },
    {
      id: 2,
      type: WithholdingType.RICA,
      scope: RuleScope.PURCHASES,
      ratePct: 0.966, // Bogotá 9.66 x 1000
      minBase: 0,
      ciiuCode: '4721',
      municipalityCode: '11001',
      onlyForAgents: false,
      segments: [
        {
          municipalityCode: '11001',
          validFrom: '2025-01-01',
          ratePct: 0.966,
        },
      ],
    },
    {
      id: 3,
      type: WithholdingType.RIVA,
      scope: RuleScope.PURCHASES,
      ratePct: 15,
      minBase: 0,
      onlyForAgents: false,
      segments: [
        {
          validFrom: '2025-01-01',
          ratePct: 15,
        },
      ],
    },
    {
      id: 4,
      type: WithholdingType.RICA,
      scope: RuleScope.SALES,
      ratePct: 0.8,
      minBase: 0,
      ciiuCode: '4721',
      municipalityCode: '11001',
      onlyForAgents: true,
      segments: [
        {
          municipalityCode: '11001',
          validFrom: '2025-01-01',
          ratePct: 0.8,
        },
      ],
    },
    {
      id: 5,
      type: WithholdingType.RTF,
      scope: RuleScope.SALES,
      ratePct: 2.5,
      minBase: toCOP(27),
      ciiuCode: '4721',
      municipalityCode: '11001',
      onlyForAgents: true,
      segments: [
        {
          municipalityCode: '11001',
          validFrom: '2025-01-01',
          ratePct: 2.5,
          minBase: toCOP(27),
        },
      ],
    },
    {
      id: 6,
      type: WithholdingType.RICA,
      scope: RuleScope.PURCHASES,
      ratePct: 0.92, // Medellín 9.2 x 1000
      minBase: 0,
      ciiuCode: '6201',
      municipalityCode: '05001',
      onlyForAgents: false,
      segments: [
        {
          municipalityCode: '05001',
          validFrom: '2025-01-01',
          ratePct: 0.92,
        },
      ],
    },
    {
      id: 7,
      type: WithholdingType.RTF,
      scope: RuleScope.SALES,
      ratePct: 3.5, // Servicios profesionales retención estándar
      minBase: toCOP(4),
      ciiuCode: '6201',
      municipalityCode: '05001',
      onlyForAgents: true,
      segments: [
        {
          municipalityCode: '05001',
          validFrom: '2025-01-01',
          ratePct: 3.5,
          minBase: toCOP(4),
        },
      ],
    },
    {
      id: 8,
      type: WithholdingType.RICA,
      scope: RuleScope.SALES,
      ratePct: 1.1, // ICA Medellín servicios
      minBase: 0,
      ciiuCode: '6201',
      municipalityCode: '05001',
      onlyForAgents: true,
      segments: [
        {
          municipalityCode: '05001',
          validFrom: '2025-01-01',
          ratePct: 1.1,
        },
      ],
    },
    {
      id: 9,
      type: WithholdingType.RICA,
      scope: RuleScope.PURCHASES,
      ratePct: 1.2, // Cali 12 x 1000
      minBase: 0,
      ciiuCode: '4711',
      municipalityCode: '76001',
      onlyForAgents: false,
      segments: [
        {
          municipalityCode: '76001',
          validFrom: '2025-01-01',
          ratePct: 1.2,
        },
      ],
    },
  ]

  for (const rule of rules) {
    await prisma.withholdingRule.upsert({
      where: { id: rule.id },
      update: {
        type: rule.type,
        scope: rule.scope,
        ratePct: rule.ratePct,
        minBase: rule.minBase ?? 0,
        fixedAmount: rule.fixedAmount ?? null,
        ciiuCode: rule.ciiuCode ?? null,
        municipalityCode: rule.municipalityCode ?? null,
        onlyForAgents: rule.onlyForAgents ?? false,
        active: true,
      },
      create: {
        id: rule.id,
        type: rule.type,
        scope: rule.scope,
        ratePct: rule.ratePct,
        minBase: rule.minBase ?? 0,
        fixedAmount: rule.fixedAmount ?? null,
        ciiuCode: rule.ciiuCode ?? null,
        municipalityCode: rule.municipalityCode ?? null,
        onlyForAgents: rule.onlyForAgents ?? false,
        active: true,
      },
    })

    await (prisma as any).withholdingSegment.deleteMany({ where: { ruleId: rule.id } })
    if (rule.segments?.length) {
      for (const seg of rule.segments) {
        await (prisma as any).withholdingSegment.create({
          data: {
            ruleId: rule.id,
            municipalityCode: seg.municipalityCode ?? rule.municipalityCode ?? null,
            departmentCode: seg.departmentCode ?? null,
            validFrom: seg.validFrom ? new Date(seg.validFrom) : null,
            validTo: seg.validTo ? new Date(seg.validTo) : null,
            minBase: seg.minBase != null ? new Prisma.Decimal(seg.minBase) : null,
            maxBase: seg.maxBase != null ? new Prisma.Decimal(seg.maxBase) : null,
            ratePct: seg.ratePct != null ? new Prisma.Decimal(seg.ratePct) : null,
            fixedAmount: seg.fixedAmount != null ? new Prisma.Decimal(seg.fixedAmount) : null,
          },
        })
      }
    }
  }
}

// ---------- Métodos de pago ----------
async function seedPaymentMethods() {
  await prisma.paymentMethod.upsert({
    where: { name: 'Efectivo' },
    update: { cashAccountCode: '110505', bankAccountCode: null, active: true },
    create: { name: 'Efectivo', cashAccountCode: '110505', active: true },
  })
  await prisma.paymentMethod.upsert({
    where: { name: 'Banco' },
    update: { cashAccountCode: null, bankAccountCode: '11100501', active: true },
    create: { name: 'Banco', bankAccountCode: '11100501', active: true },
  })
  await prisma.paymentMethod.upsert({
    where: { name: 'Transferencia' },
    update: { cashAccountCode: null, bankAccountCode: '11100501', active: true },
    create: { name: 'Transferencia', bankAccountCode: '11100501', active: true },
  })
}

// ---------- Impuesto diferido y estados financieros oficiales ----------
async function seedDeferredTaxProvisions(year: number) {
  const provisions = [
    {
      description: 'Provisión impuesto diferido maquinaria',
      debitAccountCode: '540515',
      creditAccountCode: '251505',
      amount: 1500000,
    },
    {
      description: 'Reconocimiento activo impuesto diferido inventarios',
      debitAccountCode: '171005',
      creditAccountCode: '540515',
      amount: 800000,
    },
  ]

  for (const item of provisions) {
  const existing = await (prisma as any).deferredTaxProvision.findFirst({
      where: { year, description: item.description },
    })
    if (existing) {
  await (prisma as any).deferredTaxProvision.update({
        where: { id: existing.id },
        data: {
          debitAccountCode: item.debitAccountCode,
          creditAccountCode: item.creditAccountCode,
          amount: new Prisma.Decimal(item.amount),
          active: true,
        },
      })
    } else {
  await (prisma as any).deferredTaxProvision.create({
        data: {
          year,
          description: item.description,
          debitAccountCode: item.debitAccountCode,
          creditAccountCode: item.creditAccountCode,
          amount: new Prisma.Decimal(item.amount),
          active: true,
        },
      })
    }
  }
}

async function seedFinancialStatementSnapshots(year: number) {
  const snapshots = [
    { statement: 'BALANCE_SHEET', accountCode: '110505', balance: 25000000 },
    { statement: 'BALANCE_SHEET', accountCode: '13050501', balance: 18000000 },
  { statement: 'BALANCE_SHEET', accountCode: '220505', balance: 9500000 },
    { statement: 'BALANCE_SHEET', accountCode: '251505', balance: 1200000 },
    { statement: 'INCOME_STATEMENT', accountCode: '41353001', balance: 62000000 },
    { statement: 'INCOME_STATEMENT', accountCode: '613505', balance: 31000000 },
    { statement: 'INCOME_STATEMENT', accountCode: '516005', balance: 4500000 },
    { statement: 'INCOME_STATEMENT', accountCode: '540515', balance: 1800000 },
  ] as const

  for (const snap of snapshots) {
  await (prisma as any).financialStatementSnapshot.upsert({
      where: {
        year_statement_version_accountCode: {
          year,
          statement: snap.statement as any,
          version: 'OFFICIAL',
          accountCode: snap.accountCode,
        } as any,
      },
      update: { balance: new Prisma.Decimal(snap.balance) },
      create: {
        year,
        statement: snap.statement as any,
        version: 'OFFICIAL',
        accountCode: snap.accountCode,
        balance: new Prisma.Decimal(snap.balance),
      },
    })
  }
}

async function seedFixedAssetCategories() {
  const categories = [
    {
      code: 'FA-MACH',
      name: 'Maquinaria industrial',
      description: 'Maquinaria pesada y equipos de producción',
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: 120,
      residualRate: 5,
      assetAccountCode: '150405',
      accumulatedDepreciationAccountCode: '159205',
      depreciationExpenseAccountCode: '516005',
      disposalGainAccountCode: '419505',
      disposalLossAccountCode: '619505',
    },
    {
      code: 'FA-IT',
      name: 'Tecnología y equipos TI',
      description: 'Computadores, servidores y periféricos',
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: 48,
      residualRate: 0,
      assetAccountCode: '150410',
      accumulatedDepreciationAccountCode: '159210',
      depreciationExpenseAccountCode: '516010',
      disposalGainAccountCode: '419505',
      disposalLossAccountCode: '619505',
    },
    {
      code: 'FA-LEASE',
      name: 'Activos en leasing',
      description: 'Activos bajo contratos de arrendamiento financiero',
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: 60,
      residualRate: 0,
      assetAccountCode: '151605',
      accumulatedDepreciationAccountCode: '159205',
      depreciationExpenseAccountCode: '516005',
      disposalGainAccountCode: '419505',
      disposalLossAccountCode: '619505',
    },
  ] as const

  for (const cat of categories) {
    await (prisma as any).fixedAssetCategory.upsert({
      where: { code: cat.code },
      update: {
        name: cat.name,
        description: cat.description,
        depreciationMethod: cat.depreciationMethod,
        usefulLifeMonths: cat.usefulLifeMonths,
        residualRate: cat.residualRate != null ? new Prisma.Decimal(cat.residualRate) : null,
        assetAccountCode: cat.assetAccountCode,
        accumulatedDepreciationAccountCode: cat.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountCode: cat.depreciationExpenseAccountCode,
        disposalGainAccountCode: cat.disposalGainAccountCode ?? null,
        disposalLossAccountCode: cat.disposalLossAccountCode ?? null,
      },
      create: {
        code: cat.code,
        name: cat.name,
        description: cat.description,
        depreciationMethod: cat.depreciationMethod,
        usefulLifeMonths: cat.usefulLifeMonths,
        residualRate: cat.residualRate != null ? new Prisma.Decimal(cat.residualRate) : null,
        assetAccountCode: cat.assetAccountCode,
        accumulatedDepreciationAccountCode: cat.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountCode: cat.depreciationExpenseAccountCode,
        disposalGainAccountCode: cat.disposalGainAccountCode ?? null,
        disposalLossAccountCode: cat.disposalLossAccountCode ?? null,
      },
    })
  }

  console.log(`🏭 Categorías de activos fijos listas (${categories.length})`)
}

type CalendarSeed = {
  obligation: string
  periodicity: string
  regime?: FiscalRegime | null
  municipalityCode?: string | null
  departmentCode?: string | null
  notes?: string | null
  events: {
    periodLabel: string
    dueDate: Date
    cutoffDate?: Date | null
    dianForm?: string | null
    channel?: string | null
  }[]
}

async function seedFiscalCalendars(year: number) {
  const nextYear = year + 1
  const calendars: CalendarSeed[] = [
    {
      obligation: FISCAL_OBLIGATION.VAT,
      periodicity: FISCAL_PERIODICITY.BIMONTHLY,
      regime: FiscalRegime.RESPONSABLE_IVA,
      notes: 'Cronograma base DIAN para responsables de IVA bimestral.',
      events: [
        { periodLabel: 'Bimestre 1 (Ene-Feb)', dueDate: utcDate(year, 3, 14), dianForm: '300', channel: 'MUISCA' },
        { periodLabel: 'Bimestre 2 (Mar-Abr)', dueDate: utcDate(year, 5, 15), dianForm: '300', channel: 'MUISCA' },
        { periodLabel: 'Bimestre 3 (May-Jun)', dueDate: utcDate(year, 7, 15), dianForm: '300', channel: 'MUISCA' },
        { periodLabel: 'Bimestre 4 (Jul-Ago)', dueDate: utcDate(year, 9, 16), dianForm: '300', channel: 'MUISCA' },
        { periodLabel: 'Bimestre 5 (Sep-Oct)', dueDate: utcDate(year, 11, 18), dianForm: '300', channel: 'MUISCA' },
        { periodLabel: 'Bimestre 6 (Nov-Dic)', dueDate: utcDate(nextYear, 1, 15), dianForm: '300', channel: 'MUISCA' },
      ],
    },
    {
      obligation: FISCAL_OBLIGATION.RETEFUENTE,
      periodicity: FISCAL_PERIODICITY.MONTHLY,
      regime: FiscalRegime.RESPONSABLE_IVA,
      notes: 'Retención en la fuente mensual (formulario 350).',
      events: Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1
        const dueDate = utcDate(year, month + 1, 7)
        return {
          periodLabel: `${year}-${String(month).padStart(2, '0')}`,
          dueDate,
          dianForm: '350',
          channel: 'MUISCA',
        }
      }),
    },
    {
      obligation: FISCAL_OBLIGATION.RETEICA,
      periodicity: FISCAL_PERIODICITY.BIMONTHLY,
      regime: FiscalRegime.RESPONSABLE_IVA,
      municipalityCode: '11001',
      notes: 'ICA Bogotá bimestral (formulario virtual).',
      events: [
        { periodLabel: 'Bimestre 1 (Ene-Feb)', dueDate: utcDate(year, 3, 18), channel: 'SDH Virtual' },
        { periodLabel: 'Bimestre 2 (Mar-Abr)', dueDate: utcDate(year, 5, 20), channel: 'SDH Virtual' },
        { periodLabel: 'Bimestre 3 (May-Jun)', dueDate: utcDate(year, 7, 22), channel: 'SDH Virtual' },
        { periodLabel: 'Bimestre 4 (Jul-Ago)', dueDate: utcDate(year, 9, 23), channel: 'SDH Virtual' },
        { periodLabel: 'Bimestre 5 (Sep-Oct)', dueDate: utcDate(year, 11, 25), channel: 'SDH Virtual' },
        { periodLabel: 'Bimestre 6 (Nov-Dic)', dueDate: utcDate(nextYear, 1, 24), channel: 'SDH Virtual' },
      ],
    },
    {
      obligation: FISCAL_OBLIGATION.RETEICA,
      periodicity: FISCAL_PERIODICITY.MONTHLY,
      regime: FiscalRegime.RESPONSABLE_IVA,
      municipalityCode: '05001',
      notes: 'ICA Medellín mensual (Declaración ICA).',
      events: Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1
        return {
          periodLabel: `${year}-${String(month).padStart(2, '0')}`,
          dueDate: utcDate(year, month + 1, 17),
          channel: 'Medellín Virtual',
        }
      }),
    },
    {
      obligation: FISCAL_OBLIGATION.EXOGENA,
      periodicity: FISCAL_PERIODICITY.EVENT_BASED,
      notes: 'Información exógena Grandes y Medianos contribuyentes.',
      events: [
        { periodLabel: `${year}-Obligación 01`, dueDate: utcDate(year, 4, 25), dianForm: 'Formato 1001', channel: 'MUISCA' },
      ],
    },
    {
      obligation: FISCAL_OBLIGATION.ELECTRONIC_INVOICE,
      periodicity: FISCAL_PERIODICITY.MONTHLY,
      notes: 'Seguimiento facturación electrónica mensual (sin envío automático).',
      events: Array.from({ length: 12 }, (_, idx) => {
        const month = idx + 1
        const lastDay = new Date(Date.UTC(year, month, 0, 5, 0, 0))
        return {
          periodLabel: `${year}-${String(month).padStart(2, '0')}`,
          dueDate: lastDay,
          channel: 'Portal Proveedor',
        }
      }),
    },
  ]

  for (const calendar of calendars) {
    const existing = await (prisma as any).fiscalCalendar.findFirst({
      where: {
        year,
        obligation: calendar.obligation,
        regime: calendar.regime ?? FiscalRegime.NO_RESPONSABLE_IVA,
        municipalityCode: calendar.municipalityCode ?? null,
        departmentCode: calendar.departmentCode ?? null,
      },
    })

    const payload = {
      year,
      obligation: calendar.obligation,
      periodicity: calendar.periodicity,
      regime: calendar.regime ?? FiscalRegime.NO_RESPONSABLE_IVA,
      municipalityCode: calendar.municipalityCode ?? null,
      departmentCode: calendar.departmentCode ?? null,
      notes: calendar.notes ?? null,
    }

    const record = existing
      ? await (prisma as any).fiscalCalendar.update({ where: { id: existing.id }, data: payload })
      : await (prisma as any).fiscalCalendar.create({ data: payload })

    await (prisma as any).fiscalCalendarEvent.deleteMany({ where: { calendarId: record.id } })
    for (const ev of calendar.events) {
      await (prisma as any).fiscalCalendarEvent.create({
        data: {
          calendarId: record.id,
          periodLabel: ev.periodLabel,
          dueDate: ev.dueDate,
          cutoffDate: ev.cutoffDate ?? null,
          dianForm: ev.dianForm ?? null,
          channel: ev.channel ?? null,
        },
      })
    }
  }

  console.log(`📅 Calendarios fiscales ${year} listos (${calendars.length} calendarios).`)
}

async function seedFiscalSettings() {
  const defaults = {
    dianEnvironment: DIAN_ENVIRONMENT.TEST,
    autoDeliverElectronicDocs: false,
    dianSoftwareId: process.env.DIAN_SOFTWARE_ID ?? null,
    dianSoftwarePin: process.env.DIAN_SOFTWARE_PIN ?? null,
    dianTestSetId: process.env.DIAN_TEST_SET_ID ?? null,
  }

  const existing = await (prisma as any).fiscalSettings.findFirst({ where: { id: 1 } })
  if (existing) {
    await (prisma as any).fiscalSettings.update({
      where: { id: existing.id },
      data: {
        dianEnvironment: defaults.dianEnvironment,
        autoDeliverElectronicDocs: defaults.autoDeliverElectronicDocs,
        dianSoftwareId: defaults.dianSoftwareId,
        dianSoftwarePin: defaults.dianSoftwarePin,
        dianTestSetId: defaults.dianTestSetId,
      },
    })
  } else {
    await (prisma as any).fiscalSettings.create({
      data: {
        id: 1,
        roundingMode: RoundingMode.HALF_UP,
        priceIncludesTax: false,
        dianEnvironment: defaults.dianEnvironment,
        autoDeliverElectronicDocs: defaults.autoDeliverElectronicDocs,
        dianSoftwareId: defaults.dianSoftwareId,
        dianSoftwarePin: defaults.dianSoftwarePin,
        dianTestSetId: defaults.dianTestSetId,
      },
    })
  }
}

// ---------- Centros de costo ----------
async function seedCostCenters() {
  const cc = [
    { code: '100-ADMIN', name: 'Administración Central', isReportable: true },
    { code: '200-COM', name: 'Gestión Comercial', isReportable: true },
    { code: '300-PLANTA', name: 'Planta de Producción', isReportable: true },
    { code: '310-MANT', name: 'Mantenimiento Planta', isReportable: false },
    { code: '320-CAL', name: 'Calidad y Mejora Continua', isReportable: false },
    { code: '400-LOG', name: 'Logística y Distribución', isReportable: true },
    { code: '500-PROY', name: 'Proyecto Modernización 2025', isReportable: true },
  ]
  for (const c of cc) {
    await prisma.costCenter.upsert({
      where: { code: c.code },
      update: { name: c.name, active: true, isReportable: !!c.isReportable } as any,
      create: { code: c.code, name: c.name, active: true, isReportable: !!c.isReportable } as any,
    })
  }
}

// ---------- Utilidades: obtener Tax por % ----------
async function getTaxByPct(pct: number) {
  const code = pct === 19 ? 'IVA19' : pct === 5 ? 'IVA5' : 'IVA0'
  return prisma.tax.findUnique({ where: { code } })
}

// ---------- SEED ----------
async function main() {
  // 0) Usuario admin
  await ensureAdminUser()
  // 0.1) Periodo contable abierto
  await ensureOpenAccountingPeriod(new Date())

  // 0.2) Catálogo DIVIPOLA (municipios)
  await seedMunicipalities()

  // 1) Plan de cuentas
  await seedChartOfAccounts()

  // 2) Impuestos y retenciones
  await seedTaxes()
  await seedWithholdingRules()
  await seedFixedAssetCategories()
  await seedFiscalCalendars(2025)
  await seedFiscalSettings()

  // 3) Centros de costo y métodos de pago
  await seedCostCenters()
  await seedPaymentMethods()

  // 4) Bodega
  const wh = await prisma.warehouse.upsert({
    where: { name: 'Principal' },
    update: {},
    create: { name: 'Principal' },
  })

  // 5) Categorías con perfil IVA
  const iva19 = await prisma.tax.findUnique({ where: { code: 'IVA19' } })
  const iva5 = await prisma.tax.findUnique({ where: { code: 'IVA5' } })
  const iva0 = await prisma.tax.findUnique({ where: { code: 'IVA0' } })

  // Retiramos categorías heredadas para dar paso a la nueva segmentación fiscal
  const legacyCategories = await prisma.category.findMany({
    where: { name: { in: ['Bebidas', 'Granos', 'Abarrotes'] } },
    select: { id: true },
  })
  if (legacyCategories.length) {
    const legacyIds = legacyCategories.map((c) => c.id)
    await prisma.item.updateMany({
      where: { categoryId: { in: legacyIds } },
      data: { categoryId: null },
    })
    await prisma.category.deleteMany({ where: { id: { in: legacyIds } } })
  }

  const categoriaGravado19 = await prisma.category.upsert({
    where: { name: 'Gravado 19%' },
    update: {
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva19?.id ?? null,
    },
    create: {
      name: 'Gravado 19%',
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva19?.id ?? null,
    },
  })

  const categoriaCanasta5 = await prisma.category.upsert({
    where: { name: 'Canasta familiar 5%' },
    update: {
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva5?.id ?? null,
    },
    create: {
      name: 'Canasta familiar 5%',
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva5?.id ?? null,
    },
  })

  const categoriaExento = await prisma.category.upsert({
    where: { name: 'Producto exento' },
    update: {
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: null,
      taxProfile: TaxProfile.EXENTO,
      defaultTaxId: iva0?.id ?? null,
    },
    create: {
      name: 'Producto exento',
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: null,
      taxProfile: TaxProfile.EXENTO,
      defaultTaxId: iva0?.id ?? null,
    },
  })

  // 6) Ítems con defaultTaxId
  const maiz = await prisma.item.upsert({
    where: { sku: 'MAIZ-001' },
    update: {
      name: 'Maíz',
      type: ItemType.PRODUCT,
      unit: 'KG',
      unitKind: UnitKind.WEIGHT,
      baseUnit: Unit.KG,
      displayUnit: Unit.G,
      categoryId: categoriaCanasta5.id,
      price: 3000,
      ivaPct: 5,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva5?.id ?? null,
    },
    create: {
      sku: 'MAIZ-001',
      name: 'Maíz',
      type: ItemType.PRODUCT,
      unit: 'KG',
      unitKind: UnitKind.WEIGHT,
      baseUnit: Unit.KG,
      displayUnit: Unit.G,
      categoryId: categoriaCanasta5.id,
      price: 3000,
      ivaPct: 5,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva5?.id ?? null,
    },
  })

  const gaseosa350 = await prisma.item.upsert({
    where: { sku: 'GAZ-350' },
    update: {
      name: 'Gaseosa 350 ml',
      type: ItemType.PRODUCT,
      unit: 'ML',
      unitKind: UnitKind.VOLUME,
      baseUnit: Unit.L,
      displayUnit: Unit.ML,
      categoryId: categoriaGravado19.id,
      price: 2500,
      ivaPct: 19,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva19?.id ?? null,
    },
    create: {
      sku: 'GAZ-350',
      name: 'Gaseosa 350 ml',
      type: ItemType.PRODUCT,
      unit: 'ML',
      unitKind: UnitKind.VOLUME,
      baseUnit: Unit.L,
      displayUnit: Unit.ML,
      categoryId: categoriaGravado19.id,
      price: 2500,
      ivaPct: 19,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: '240805',
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultTaxId: iva19?.id ?? null,
    },
  })

  const azucar = await prisma.item.upsert({
    where: { sku: 'AZUC-001' },
    update: {
      name: 'Azúcar',
      type: ItemType.PRODUCT,
      unit: 'KG',
      unitKind: UnitKind.WEIGHT,
      baseUnit: Unit.KG,
      displayUnit: Unit.G,
      categoryId: categoriaExento.id,
      price: 3500,
      ivaPct: 0,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: null,
      taxProfile: TaxProfile.EXENTO,
      defaultTaxId: iva0?.id ?? null,
    },
    create: {
      sku: 'AZUC-001',
      name: 'Azúcar',
      type: ItemType.PRODUCT,
      unit: 'KG',
      unitKind: UnitKind.WEIGHT,
      baseUnit: Unit.KG,
      displayUnit: Unit.G,
      categoryId: categoriaExento.id,
      price: 3500,
      ivaPct: 0,
      incomeAccountCode: '413505',
      expenseAccountCode: '613505',
      inventoryAccountCode: '143505',
      taxAccountCode: null,
      taxProfile: TaxProfile.EXENTO,
      defaultTaxId: iva0?.id ?? null,
    },
  })

  // 7) Terceros con perfil fiscal
  const cliente1 = await prisma.thirdParty.upsert({
    where: { document: 'CC-100' },
    update: {
      roles: { set: [PartyType.CLIENT] },
    } as any,
    create: {
      type: PartyType.CLIENT,
      roles: [PartyType.CLIENT],
      document: 'CC-100',
      name: 'Cliente Demo 1',
      receivableAccountCode: '13050501',
      fiscalRegime: FiscalRegime.NO_RESPONSABLE_IVA,
      taxProfile: TaxProfile.NA,
      defaultVatId: iva0?.id ?? null,
      isWithholdingAgent: false,
      ciiuCode: '4721',
      municipalityCode: '11001',
    } as any,
  })
  const cliente2 = await prisma.thirdParty.upsert({
    where: { document: 'CC-200' },
    update: {
      roles: { set: [PartyType.CLIENT] },
    } as any,
    create: {
      type: PartyType.CLIENT,
      roles: [PartyType.CLIENT],
      document: 'CC-200',
      name: 'Cliente Agente Retenedor',
      receivableAccountCode: '13050501',
      fiscalRegime: FiscalRegime.RESPONSABLE_IVA,
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultVatId: iva19?.id ?? null,
      isWithholdingAgent: true, // <- este cliente retiene en ventas
      ciiuCode: '4721',
      municipalityCode: '11001',
    } as any,
  })
  await prisma.thirdParty.upsert({
    where: { document: 'NIT-901500' },
    update: {
      roles: { set: [PartyType.CLIENT] },
    } as any,
    create: {
      type: PartyType.CLIENT,
      roles: [PartyType.CLIENT],
      document: 'NIT-901500',
      name: 'Cliente Antioquia Retenedor',
      receivableAccountCode: '13050502',
      fiscalRegime: FiscalRegime.RESPONSABLE_IVA,
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultVatId: iva19?.id ?? null,
      isWithholdingAgent: true,
      ciiuCode: '6201',
      municipalityCode: '05001',
    } as any,
  })
  const proveedor1 = await prisma.thirdParty.upsert({
    where: { document: 'NIT-900100' },
    update: {
      roles: { set: [PartyType.PROVIDER] },
    } as any,
    create: {
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER],
      document: 'NIT-900100',
      name: 'Proveedor Bebidas S.A.',
      payableAccountCode: '220505',
      fiscalRegime: FiscalRegime.RESPONSABLE_IVA,
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultVatId: iva19?.id ?? null,
      isWithholdingAgent: false,
      ciiuCode: '1101',
      municipalityCode: '11001',
    } as any,
  })
  await prisma.thirdParty.upsert({
    where: { document: 'NIT-901800' },
    update: {
      roles: { set: [PartyType.PROVIDER] },
    } as any,
    create: {
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER],
      document: 'NIT-901800',
      name: 'Proveedor Servicios TI S.A.S.',
      payableAccountCode: '22050502',
      fiscalRegime: FiscalRegime.RESPONSABLE_IVA,
      taxProfile: TaxProfile.IVA_RESPONSABLE,
      defaultVatId: iva19?.id ?? null,
      isWithholdingAgent: true,
      ciiuCode: '6201',
      municipalityCode: '05001',
    } as any,
  })

  // Empleados y entidades de seguridad social
  const epsSura = await prisma.thirdParty.upsert({
    where: { document: 'EPS-890123456' },
    update: {
      name: 'EPS Sura',
      type: PartyType.PROVIDER,
      roles: { set: [PartyType.PROVIDER, PartyType.OTHER] },
      providerPayableAccountCode: '237005',
    } as any,
    create: {
      document: 'EPS-890123456',
      name: 'EPS Sura',
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER, PartyType.OTHER],
      providerPayableAccountCode: '237005',
    } as any,
  })

  const pensionPorvenir = await prisma.thirdParty.upsert({
    where: { document: 'PEN-800123987' },
    update: {
      name: 'AFP Porvenir',
      type: PartyType.PROVIDER,
      roles: { set: [PartyType.PROVIDER, PartyType.OTHER] },
      providerPayableAccountCode: '237015',
    } as any,
    create: {
      document: 'PEN-800123987',
      name: 'AFP Porvenir',
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER, PartyType.OTHER],
      providerPayableAccountCode: '237015',
    } as any,
  })

  const arlBolivar = await prisma.thirdParty.upsert({
    where: { document: 'ARL-830512987' },
    update: {
      name: 'ARL Bolívar',
      type: PartyType.PROVIDER,
      roles: { set: [PartyType.PROVIDER, PartyType.OTHER] },
      providerPayableAccountCode: '237006',
    } as any,
    create: {
      document: 'ARL-830512987',
      name: 'ARL Bolívar',
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER, PartyType.OTHER],
      providerPayableAccountCode: '237006',
    } as any,
  })

  const ccfComfama = await prisma.thirdParty.upsert({
    where: { document: 'CCF-890900567' },
    update: {
      name: 'Caja de Compensación Comfama',
      type: PartyType.PROVIDER,
      roles: { set: [PartyType.PROVIDER, PartyType.OTHER] },
      providerPayableAccountCode: '237010',
    } as any,
    create: {
      document: 'CCF-890900567',
      name: 'Caja de Compensación Comfama',
      type: PartyType.PROVIDER,
      roles: [PartyType.PROVIDER, PartyType.OTHER],
      providerPayableAccountCode: '237010',
    } as any,
  })

  const empleado1 = await prisma.thirdParty.upsert({
    where: { document: 'CC-300' },
    update: {
      name: 'Laura Medina',
      type: PartyType.EMPLOYEE,
      roles: { set: [PartyType.EMPLOYEE] },
      employeePayableAccountCode: '250505',
      payableAccountCode: '250505',
    } as any,
    create: {
      document: 'CC-300',
      name: 'Laura Medina',
      type: PartyType.EMPLOYEE,
      roles: [PartyType.EMPLOYEE],
      employeePayableAccountCode: '250505',
      payableAccountCode: '250505',
    } as any,
  })

  const empleado2 = await prisma.thirdParty.upsert({
    where: { document: 'CC-301' },
    update: {
      name: 'Andrés Rojas',
      type: PartyType.EMPLOYEE,
      roles: { set: [PartyType.EMPLOYEE] },
      employeePayableAccountCode: '250505',
      payableAccountCode: '250505',
    } as any,
    create: {
      document: 'CC-301',
      name: 'Andrés Rojas',
      type: PartyType.EMPLOYEE,
      roles: [PartyType.EMPLOYEE],
      employeePayableAccountCode: '250505',
      payableAccountCode: '250505',
    } as any,
  })

  const employeeSeeds = [
    {
      thirdPartyId: empleado1.id,
      status: 'ACTIVE' as const,
      jobTitle: 'Analista Contable',
      department: 'Finanzas',
      hireDate: addMonths(new Date(), -18),
      affiliations: [
        { kind: 'EPS', thirdPartyId: epsSura.id, startDate: addMonths(new Date(), -18) },
        { kind: 'PENSION', thirdPartyId: pensionPorvenir.id, startDate: addMonths(new Date(), -18) },
        { kind: 'ARL', thirdPartyId: arlBolivar.id, startDate: addMonths(new Date(), -18) },
        { kind: 'CCF', thirdPartyId: ccfComfama.id, startDate: addMonths(new Date(), -18) },
      ],
    },
    {
      thirdPartyId: empleado2.id,
      status: 'ACTIVE' as const,
      jobTitle: 'Coordinador de Planta',
      department: 'Operaciones',
      hireDate: addMonths(new Date(), -30),
      affiliations: [
        { kind: 'EPS', thirdPartyId: epsSura.id, startDate: addMonths(new Date(), -30) },
        { kind: 'PENSION', thirdPartyId: pensionPorvenir.id, startDate: addMonths(new Date(), -30) },
        { kind: 'ARL', thirdPartyId: arlBolivar.id, startDate: addMonths(new Date(), -30) },
        { kind: 'CCF', thirdPartyId: ccfComfama.id, startDate: addMonths(new Date(), -30) },
      ],
    },
  ]

  for (const seed of employeeSeeds) {
    const profile = await prisma.employeeProfile.upsert({
      where: { thirdPartyId: seed.thirdPartyId },
      update: {
        status: seed.status,
        jobTitle: seed.jobTitle,
        department: seed.department,
        hireDate: seed.hireDate,
        payableAccountCode: '250505',
      },
      create: {
        thirdParty: { connect: { id: seed.thirdPartyId } },
        status: seed.status,
        jobTitle: seed.jobTitle,
        department: seed.department,
        hireDate: seed.hireDate,
        payableAccountCode: '250505',
      },
    })

    for (const affiliation of seed.affiliations) {
      await prisma.employeeAffiliation.upsert({
        where: {
          employeeId_kind_thirdPartyId: {
            employeeId: profile.id,
            kind: affiliation.kind as any,
            thirdPartyId: affiliation.thirdPartyId,
          },
        },
        update: {
          startDate: affiliation.startDate,
          endDate: null,
        },
        create: {
          employeeId: profile.id,
          kind: affiliation.kind as any,
          thirdPartyId: affiliation.thirdPartyId,
          startDate: affiliation.startDate,
        },
      })
    }
  }

  const currentYear = new Date().getFullYear()
  await seedDeferredTaxProvisions(currentYear)
  await seedFinancialStatementSnapshots(currentYear)

  // 8) Periodo contable por si cambia el mes
  await ensureOpenAccountingPeriod(new Date())

  // 9) Stock inicial por ajuste
  await ensureStockMoveByNote({
    itemId: maiz.id,
    warehouseId: wh.id,
    type: StockMoveType.ADJUSTMENT,
    qty: 5,
    uom: Unit.KG,
    unitCost: 1500,
    note: 'Seed: ajuste inicial maíz 5 KG',
  })
  await ensureStockMoveByNote({
    itemId: gaseosa350.id,
    warehouseId: wh.id,
    type: StockMoveType.ADJUSTMENT,
    qty: 10,
    uom: Unit.L,
    unitCost: 1200,
    note: 'Seed: ajuste inicial gaseosa 10 L',
  })
  await ensureStockMoveByNote({
    itemId: azucar.id,
    warehouseId: wh.id,
    type: StockMoveType.ADJUSTMENT,
    qty: 8,
    uom: Unit.KG,
    unitCost: 2000,
    note: 'Seed: ajuste inicial azúcar 8 KG',
  })

  // 10) COMPRA a crédito (2 cuotas) #5001 + InvoiceTax + InvoiceWithholding
  const purchaseLines = [
    { item: maiz, qty: 3, unitCost: 1500, vatPct: 5 },
    { item: gaseosa350, qty: 5, unitCost: 1800, vatPct: 19 },
  ]
  const pCalc = calcPurchase(purchaseLines.map((l) => ({ qty: l.qty, unitCost: l.unitCost, vatPct: l.vatPct })))

  let pInv = await prisma.purchaseInvoice.findUnique({ where: { number: 5001 } })
  if (!pInv) {
    pInv = await prisma.purchaseInvoice.create({
      data: {
        number: 5001,
        thirdPartyId: proveedor1.id,
        issueDate: new Date(),
        paymentType: PaymentType.CREDIT,
        status: 'ISSUED',
        subtotal: pCalc.subtotal,
        tax: pCalc.tax,
        total: pCalc.total,
        taxBase: pCalc.subtotal,
        note: 'Compra demo a crédito (2 cuotas quincenales)',
        installments: 2,
        installmentFrequency: InstallmentFrequency.BIWEEKLY,
        firstInstallmentDueDate: addDays(new Date(), 15),
        lines: {
          create: await Promise.all(
            purchaseLines.map(async (l, i) => {
              const tax = await getTaxByPct(l.vatPct ?? 0)
              return {
                itemId: l.item.id,
                qty: l.qty,
                unitCost: l.unitCost!,
                vatPct: l.vatPct,
                taxId: tax?.id,
                lineSubtotal: pCalc.lineTotals[i].sub,
                lineVat: pCalc.lineTotals[i].vat,
                lineTotal: pCalc.lineTotals[i].tot,
              }
            }),
          ),
        },
      },
    })
  }

  // Registrar InvoiceTax por línea (compra)
  const pLines = await prisma.purchaseInvoiceLine.findMany({ where: { invoiceId: pInv.id } })
  for (const ln of pLines) {
    if (ln.taxId) {
      await prisma.invoiceTax.create({
        data: {
          taxId: ln.taxId,
          base: ln.lineSubtotal,
          ratePct: (await prisma.tax.findUnique({ where: { id: ln.taxId } }))!.ratePct as any,
          amount: ln.lineVat,
          included: false,
          purchaseInvoiceId: pInv.id,
          purchaseInvoiceLineId: ln.id,
        },
      })
    }
  }

  // Retenciones en compra (RF + RICA + RIVA sobre IVA)
  // Base = subtotal; RIVA base = IVA
  const rfRule = await prisma.withholdingRule.findUnique({ where: { id: 1 } }) // RTF compras 2.5%
  const ricaRule = await prisma.withholdingRule.findUnique({ where: { id: 2 } }) // RICA compras 0.966% Bogotá 4721
  const rivaRule = await prisma.withholdingRule.findUnique({ where: { id: 3 } }) // RIVA compras 15% del IVA

  let pWithholdingTotal = 0

  if (rfRule) {
    const amount = round2(Number(pInv.subtotal) * Number(rfRule.ratePct) / 100)
    await prisma.invoiceWithholding.create({
      data: {
        type: WithholdingType.RTF,
        ruleId: rfRule.id,
        base: pInv.subtotal,
        ratePct: rfRule.ratePct,
        amount,
        purchaseInvoiceId: pInv.id,
      },
    })
    pWithholdingTotal += amount
  }
  if (ricaRule) {
    const amount = round2(Number(pInv.subtotal) * Number(ricaRule.ratePct) / 100)
    await prisma.invoiceWithholding.create({
      data: {
        type: WithholdingType.RICA,
        ruleId: ricaRule.id,
        base: pInv.subtotal,
        ratePct: ricaRule.ratePct,
        amount,
        purchaseInvoiceId: pInv.id,
      },
    })
    pWithholdingTotal += amount
  }
  if (rivaRule && Number(pInv.tax) > 0) {
    const amount = round2(Number(pInv.tax) * Number(rivaRule.ratePct) / 100)
    await prisma.invoiceWithholding.create({
      data: {
        type: WithholdingType.RIVA,
        ruleId: rivaRule.id,
        base: pInv.tax, // base es el IVA
        ratePct: rivaRule.ratePct,
        amount,
        purchaseInvoiceId: pInv.id,
      },
    })
    pWithholdingTotal += amount
  }

  // Actualizar totales de compra
  await prisma.purchaseInvoice.update({
    where: { id: pInv.id },
    data: { withholdingTotal: pWithholdingTotal, total: round2(Number(pInv.subtotal) + Number(pInv.tax) - pWithholdingTotal) },
  })

  // CxP y cuotas
  let ap = await prisma.accountsPayable.findUnique({ where: { invoiceId: pInv.id } })
  if (!ap) {
    ap = await prisma.accountsPayable.create({
      data: { thirdPartyId: proveedor1.id, invoiceId: pInv.id, balance: (await prisma.purchaseInvoice.findUnique({ where: { id: pInv.id } }))!.total },
    })
  } else {
    const pv = await prisma.purchaseInvoice.findUnique({ where: { id: pInv.id } })
    await prisma.accountsPayable.update({ where: { id: ap.id }, data: { balance: pv!.total } })
  }
  await createInstallmentsForAPIfMissing(
    ap.id,
    Number((await prisma.purchaseInvoice.findUnique({ where: { id: pInv.id } }))!.total),
    2,
    InstallmentFrequency.BIWEEKLY,
    pInv.firstInstallmentDueDate ?? addDays(pInv.issueDate, 15),
  )

  // Movimientos de stock por compra
  for (const l of purchaseLines) {
    await ensureStockMoveByNote({
      itemId: l.item.id,
      warehouseId: wh.id,
      type: StockMoveType.PURCHASE,
      qty: l.qty,
      uom: l.item.baseUnit,
      unitCost: l.unitCost!,
      refType: 'PurchaseInvoice',
      refId: pInv.id,
      note: `Compra #${pInv.number} - ${l.item.sku}`,
    })
  }

  // 11) VENTA CONTADO #1001 (con IVA en gaseosa) + InvoiceTax
  const sale1Lines = [
    { item: maiz, qty: 0.2, unitPrice: 3000, vatPct: 5 },
    { item: gaseosa350, qty: 2, unitPrice: 2500, vatPct: 19 },
  ]
  const s1Calc = calcSales(sale1Lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, vatPct: l.vatPct })))

  let sInv1 = await prisma.salesInvoice.findUnique({ where: { number: 1001 } })
  if (!sInv1) {
    sInv1 = await prisma.salesInvoice.create({
      data: {
        number: 1001,
        thirdPartyId: cliente1.id,
        issueDate: new Date(),
        paymentType: PaymentType.CASH,
        status: 'ISSUED',
        subtotal: s1Calc.subtotal,
        tax: s1Calc.tax,
        total: s1Calc.total,
        taxBase: s1Calc.subtotal,
        note: 'Venta contado demo',
        lines: {
          create: await Promise.all(
            sale1Lines.map(async (l, i) => {
              const tax = await getTaxByPct(l.vatPct ?? 0)
              return {
                itemId: l.item.id,
                qty: l.qty,
                unitPrice: l.unitPrice!,
                vatPct: l.vatPct,
                taxId: tax?.id,
                lineSubtotal: s1Calc.lineTotals[i].sub,
                lineVat: s1Calc.lineTotals[i].vat,
                lineTotal: s1Calc.lineTotals[i].tot,
              }
            }),
          ),
        },
      },
    })
  }

  // Registrar InvoiceTax por línea (venta)
  const s1Lines = await prisma.salesInvoiceLine.findMany({ where: { invoiceId: sInv1.id } })
  for (const ln of s1Lines) {
    if (ln.taxId) {
      await prisma.invoiceTax.create({
        data: {
          taxId: ln.taxId,
          base: ln.lineSubtotal,
          ratePct: (await prisma.tax.findUnique({ where: { id: ln.taxId } }))!.ratePct as any,
          amount: ln.lineVat,
          included: false,
          salesInvoiceId: sInv1.id,
          salesInvoiceLineId: ln.id,
        },
      })
    }
  }

  // Recibo de caja
  const rcpt1Note = 'Cobro venta contado 1001'
  let rcpt1 = await prisma.cashReceipt.findFirst({ where: { note: rcpt1Note } })
  if (!rcpt1) {
    rcpt1 = await prisma.cashReceipt.create({
      data: {
        thirdParty: { connect: { id: cliente1.id } },
        date: new Date(),
        total: sInv1.total,
        note: rcpt1Note,
        method: { connect: { name: 'Efectivo' } },
        allocations: { create: [{ invoiceId: sInv1.id, amount: sInv1.total }] },
      },
    })
  }

  // Stock por venta contado
  await ensureStockMoveByNote({
    itemId: maiz.id,
    warehouseId: wh.id,
    type: StockMoveType.SALE,
    qty: 0.2,
    uom: Unit.KG,
    unitCost: 1500,
    refType: 'SalesInvoice',
    refId: sInv1.id,
    note: 'Venta 1001: 200 g maíz',
  })
  await ensureStockMoveByNote({
    itemId: gaseosa350.id,
    warehouseId: wh.id,
    type: StockMoveType.SALE,
    qty: 0.7,
    uom: Unit.L,
    unitCost: 1200,
    refType: 'SalesInvoice',
    refId: sInv1.id,
    note: 'Venta 1001: 2 x 350 ml',
  })

  // 12) VENTA CRÉDITO #1002 (3 cuotas) a cliente agente retenedor
  const sale2Lines = [
    { item: maiz, qty: 1, unitPrice: 3000, vatPct: 5 },
    { item: azucar, qty: 1.5, unitPrice: 3500, vatPct: 0 },
    { item: gaseosa350, qty: 1, unitPrice: 2500, vatPct: 19 },
  ]
  const s2Calc = calcSales(sale2Lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, vatPct: l.vatPct })))
  const firstDue = addMonths(new Date(), 1)

  let sInv2 = await prisma.salesInvoice.findUnique({ where: { number: 1002 } })
  if (!sInv2) {
    sInv2 = await prisma.salesInvoice.create({
      data: {
        number: 1002,
        thirdPartyId: cliente2.id,
        issueDate: new Date(),
        paymentType: PaymentType.CREDIT,
        status: 'ISSUED',
        subtotal: s2Calc.subtotal,
        tax: s2Calc.tax,
        total: s2Calc.total,
        taxBase: s2Calc.subtotal,
        note: 'Venta crédito demo 3 cuotas (cliente agente retenedor)',
        installments: 3,
        installmentFrequency: InstallmentFrequency.MONTHLY,
        firstInstallmentDueDate: firstDue,
        lines: {
          create: await Promise.all(
            sale2Lines.map(async (l, i) => {
              const tax = await getTaxByPct(l.vatPct ?? 0)
              return {
                itemId: l.item.id,
                qty: l.qty,
                unitPrice: l.unitPrice!,
                vatPct: l.vatPct,
                taxId: tax?.id,
                lineSubtotal: s2Calc.lineTotals[i].sub,
                lineVat: s2Calc.lineTotals[i].vat,
                lineTotal: s2Calc.lineTotals[i].tot,
              }
            }),
          ),
        },
      },
    })
  }

  // InvoiceTax por línea (venta 1002)
  const s2Lines = await prisma.salesInvoiceLine.findMany({ where: { invoiceId: sInv2.id } })
  for (const ln of s2Lines) {
    if (ln.taxId) {
      await prisma.invoiceTax.create({
        data: {
          taxId: ln.taxId,
          base: ln.lineSubtotal,
          ratePct: (await prisma.tax.findUnique({ where: { id: ln.taxId } }))!.ratePct as any,
          amount: ln.lineVat,
          included: false,
          salesInvoiceId: sInv2.id,
          salesInvoiceLineId: ln.id,
        },
      })
    }
  }

  // Retenciones en venta (cliente agente retenedor): ReteICA + ReteFUENTE
  const ricaSalesRule = await prisma.withholdingRule.findUnique({ where: { id: 4 } })
  const rtfSalesRule = await prisma.withholdingRule.findUnique({ where: { id: 5 } })

  let s2WithholdingTotal = 0
  const s2Base = s2Calc.subtotal

  if (cliente2.isWithholdingAgent && ricaSalesRule) {
    const amount = round2(s2Base * Number(ricaSalesRule.ratePct) / 100)
    await prisma.invoiceWithholding.create({
      data: {
        type: WithholdingType.RICA,
        ruleId: ricaSalesRule.id,
        base: s2Base,
        ratePct: ricaSalesRule.ratePct,
        amount,
        salesInvoiceId: sInv2.id,
      },
    })
    s2WithholdingTotal += amount
  }
  if (cliente2.isWithholdingAgent && rtfSalesRule) {
    const amount = round2(s2Base * Number(rtfSalesRule.ratePct) / 100)
    await prisma.invoiceWithholding.create({
      data: {
        type: WithholdingType.RTF,
        ruleId: rtfSalesRule.id,
        base: s2Base,
        ratePct: rtfSalesRule.ratePct,
        amount,
        salesInvoiceId: sInv2.id,
      },
    })
    s2WithholdingTotal += amount
  }

  await prisma.salesInvoice.update({
    where: { id: sInv2.id },
    data: { withholdingTotal: s2WithholdingTotal, total: round2(Number(s2Calc.subtotal) + Number(s2Calc.tax) - s2WithholdingTotal) },
  })

  // CxC y cuotas
  let ar = await prisma.accountsReceivable.findUnique({ where: { invoiceId: sInv2.id } })
  if (!ar) {
    ar = await prisma.accountsReceivable.create({
      data: { thirdPartyId: cliente2.id, invoiceId: sInv2.id, balance: (await prisma.salesInvoice.findUnique({ where: { id: sInv2.id } }))!.total },
    })
  } else {
    const sv = await prisma.salesInvoice.findUnique({ where: { id: sInv2.id } })
    await prisma.accountsReceivable.update({ where: { id: ar.id }, data: { balance: sv!.total } })
  }
  await createInstallmentsForARIfMissing(ar.id, Number((await prisma.salesInvoice.findUnique({ where: { id: sInv2.id } }))!.total), 3, InstallmentFrequency.MONTHLY, firstDue)

  // Stock por venta crédito
  await ensureStockMoveByNote({
    itemId: maiz.id,
    warehouseId: wh.id,
    type: StockMoveType.SALE,
    qty: 1.0,
    uom: Unit.KG,
    unitCost: 1500,
    refType: 'SalesInvoice',
    refId: sInv2.id,
    note: 'Venta 1002: 1 KG maíz',
  })
  await ensureStockMoveByNote({
    itemId: azucar.id,
    warehouseId: wh.id,
    type: StockMoveType.SALE,
    qty: 1.5,
    uom: Unit.KG,
    unitCost: 2000,
    refType: 'SalesInvoice',
    refId: sInv2.id,
    note: 'Venta 1002: 1.5 KG azúcar',
  })
  await ensureStockMoveByNote({
    itemId: gaseosa350.id,
    warehouseId: wh.id,
    type: StockMoveType.SALE,
    qty: 1.0,
    uom: Unit.L,
    unitCost: 1200,
    refType: 'SalesInvoice',
    refId: sInv2.id,
    note: 'Venta 1002: gaseosa',
  })

  // 13) Pago/cobro parciales (mismos que tenías, opcional)
  const firstARinst = await prisma.installment.findFirst({
    where: { receivableId: ar.id, number: 1 },
  })
  if (firstARinst) {
    const payAmount = round2(Number(firstARinst.amount) * 0.5)
    const rcpt2Note = 'Cobro parcial cuota 1 venta 1002'
    let rcpt2 = await prisma.cashReceipt.findFirst({ where: { note: rcpt2Note } })
    if (!rcpt2) {
      rcpt2 = await prisma.cashReceipt.create({
        data: {
          thirdParty: { connect: { id: cliente2.id } },
          date: new Date(),
          total: payAmount,
          note: rcpt2Note,
          method: { connect: { name: 'Transferencia' } },
          allocations: {
            create: [{ invoiceId: sInv2.id, amount: payAmount, installmentId: firstARinst.id }],
          },
        },
      })
    }
  }

  const firstAPinst = await prisma.installment.findFirst({
    where: { payableId: ap.id, number: 1 },
  })
  if (firstAPinst) {
    const payAmount = round2(Number(firstAPinst.amount) * 0.6)
    const vpNote = 'Pago parcial cuota 1 compra 5001'
    let vpay = await prisma.vendorPayment.findFirst({ where: { note: vpNote } })
    if (!vpay) {
      vpay = await prisma.vendorPayment.create({
        data: {
          thirdParty: { connect: { id: proveedor1.id } },
          date: new Date(),
          total: payAmount,
          note: vpNote,
          method: { connect: { name: 'Banco' } },
          allocations: { create: [{ invoiceId: pInv.id, amount: payAmount, installmentId: firstAPinst.id }] },
        },
      })
    }
  }

  console.log('🌱 Seed completado OK (IVA + Retenciones)')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
