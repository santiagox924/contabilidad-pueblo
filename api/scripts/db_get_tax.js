const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function run() {
  try {
    const t = await prisma.tax.findUnique({ where: { id: 3 } })
    console.log(t)
  } catch (err) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}
run()
