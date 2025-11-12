import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/prisma/prisma.service'

async function run(){
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const prisma = app.get(PrismaService)
  const item = await prisma.item.findUnique({ where: { id: 5 }, select: { id: true, ivaPct: true, defaultTaxId: true } })
  console.log('Item:', item)
  const tax = await prisma.tax.findUnique({ where: { id: item?.defaultTaxId ?? -1 }, select: { id: true, ratePct: true } })
  console.log('Tax:', tax)
  await app.close()
}

run().catch(e=>{ console.error(e); process.exit(1) })
