const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function run() {
  try {
    const id = 5
    console.log('Updating item', id, '-> ivaPct = 19')
    const updated = await prisma.item.update({ where: { id }, data: { ivaPct: 19 } })
    console.log('Updated:', { id: updated.id, name: updated.name, ivaPct: updated.ivaPct })
  } catch (err) {
    console.error('Update failed', err)
  } finally {
    await prisma.$disconnect()
  }
}
run()
