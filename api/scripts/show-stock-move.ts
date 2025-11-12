import { PrismaClient } from '@prisma/client'

const id = Number(process.argv[2])
if (!id) {
  console.error('Usage: ts-node scripts/show-stock-move.ts <id>')
  process.exit(1)
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const mv = await prisma.stockMove.findUnique({
      where: { id },
      include: { item: true },
    })
    console.log(mv)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
