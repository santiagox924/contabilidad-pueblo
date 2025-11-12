import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { ItemsService } from '../src/items/items.service'

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const itemsSvc = app.get(ItemsService)
  const res = await itemsSvc.findAll()
  const items = (res as any).items || []
  console.log('Items (id, name, price, ivaPct, effectiveVatPct):')
  items.slice(0,50).forEach((it:any) => console.log(it.id, it.name, 'price=', it.price, 'ivaPct=', it.ivaPct, 'effective=', it.effectiveVatPct))
  await app.close()
}

run().catch(e => { console.error(e); process.exit(1) })
