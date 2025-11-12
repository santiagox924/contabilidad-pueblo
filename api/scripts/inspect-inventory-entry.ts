import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    const lines = await prisma.journalLine.findMany({
      where: { accountCode: '143505' },
      orderBy: { id: 'desc' },
      take: 10,
      include: { entry: { select: { id: true, sourceType: true, sourceId: true, date: true } } },
    })
    console.log('Últimas líneas para 143505:')
    for (const l of lines) {
      console.log({
        id: l.id,
        entryId: l.entryId,
        sourceType: l.entry?.sourceType,
        sourceId: l.entry?.sourceId,
        debit: l.debit.toString(),
        credit: l.credit.toString(),
        description: l.description,
        date: l.entry?.date,
      })
    }

    const totals = await prisma.journalLine.groupBy({
      by: ['accountCode'],
      where: { accountCode: { in: ['143505', '613505'] } },
      _sum: { debit: true, credit: true },
    })
    console.log('Totales parciales 143505 / 613505:')
    for (const t of totals) {
      console.log({ accountCode: t.accountCode, debit: t._sum.debit?.toString(), credit: t._sum.credit?.toString() })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
