const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function run() {
  try {
    const items = await prisma.item.findMany({ select: { id: true, name: true, price: true, ivaPct: true }, take: 100 })
    if (!items || !items.length) {
      console.log('No items found')
      return
    }
    console.log('Items (id, name, price, ivaPct):')
    items.forEach(it => console.log(it.id, it.name, 'price=', it.price, 'ivaPct=', it.ivaPct))
  } catch (err) {
    console.error('DB query failed', err)
  } finally {
    await prisma.$disconnect()
  }
}
run()
