import { PrismaClient } from '@prisma/client'

const itemId = Number(process.argv[2])
if (!itemId) {
  console.error('Usage: ts-node scripts/show-stock-layers.ts <itemId>')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const layers = await prisma.stockLayer.findMany({
      where: { itemId },
      orderBy: { id: 'asc' },
    })
    console.log(layers.map((l) => ({
      id: l.id,
      warehouseId: l.warehouseId,
      remainingQty: l.remainingQty.toString(),
      unitCost: l.unitCost.toString(),
      moveInId: l.moveInId,
      createdAt: l.createdAt,
    })))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
