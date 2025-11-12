const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function run() {
  try {
    const id = 5
    const it = await prisma.item.findUnique({ where: { id }, include: { category: true } })
    console.log(it)
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}
run()
