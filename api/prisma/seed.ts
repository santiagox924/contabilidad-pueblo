import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const accounts = [
  { code: '1105', name: 'Caja', nature: 'D' },
  { code: '1110', name: 'Bancos', nature: 'D' },
  { code: '1305', name: 'Clientes (CxC)', nature: 'D' },
  { code: '1435', name: 'Inventarios', nature: 'D' },
  { code: '2205', name: 'Proveedores (CxP)', nature: 'C' },
  { code: '2408', name: 'IVA por pagar', nature: 'C' },
  { code: '3105', name: 'Capital social', nature: 'C' },
  { code: '4135', name: 'Ingresos por ventas', nature: 'C' },
  { code: '6135', name: 'Costo de ventas', nature: 'D' },
  { code: '5135', name: 'Servicios públicos', nature: 'D' },
  { code: '5140', name: 'Arrendamientos', nature: 'D' },
  { code: '5155', name: 'Mantenimiento', nature: 'D' },
  { code: '5105', name: 'Gastos de nómina', nature: 'D' },
]

async function main() {
  for (const a of accounts) {
    await prisma.coaAccount.upsert({
      where: { code: a.code },
      create: a,
      update: a,
    })
  }
  console.log(`Plan de cuentas sembrado: ${accounts.length} cuentas.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
