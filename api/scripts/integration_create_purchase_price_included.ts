/* Integration script: create a CASH purchase with priceIncludesTax per line
   - Creates a purchase with stock for itemId=5, qty=1, unitCost=103000, priceIncludesTax=true
   - Prints the created invoice, lines and calls accounting posting results (if any)

   Run with: npx ts-node scripts/integration_create_purchase_price_included.ts
*/

import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { PurchasesService } from '../src/purchases/purchases.service'
import { PrismaService } from '../src/prisma/prisma.service'

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false })
  const purchases = app.get(PurchasesService)
  const prisma = app.get(PrismaService)

  try {
    const item = await prisma.item.findUnique({ where: { id: 5 } })
    if (!item) throw new Error('Item id=5 not found')

    // find a provider and a warehouse
    const tp = await prisma.thirdParty.findFirst({ where: { roles: { has: 'PROVIDER' } } })
    if (!tp) throw new Error('No provider (thirdParty with role PROVIDER) found in DB')
    const wh = await prisma.warehouse.findFirst()
    if (!wh) throw new Error('No warehouse found in DB')

    const dto: any = {
      thirdPartyId: tp.id,
      issueDate: new Date().toISOString().slice(0,10),
      paymentType: 'CASH',
      lines: [
        {
          itemId: 5,
          warehouseId: wh.id,
          qty: 1,
          unitCost: 103000,
          // omit vatPct so server resolves from item.defaultTaxId/effective VAT
          priceIncludesTax: true,
          uom: item.displayUnit ?? 'UN'
        }
      ]
    }

    console.log('Creating purchase with DTO:', JSON.stringify(dto, null, 2))
    const created = await purchases.create(dto)
    console.log('\nCreated purchase (full):')
    console.dir(created, { depth: 4 })

    const invId = created.id
    console.log('\nInvoice lines:')
    console.dir(created.lines, { depth: 4 })

    const moves = await prisma.stockMove.findMany({ where: { refType: 'PurchaseInvoice', refId: invId } })
    console.log('\nStock moves created:')
    console.dir(moves, { depth: 4 })

    const ap = await prisma.accountsPayable.findUnique({ where: { invoiceId: invId } })
    console.log('\nAccountsPayable record (should be null for CASH):')
    console.dir(ap, { depth: 4 })

    // common journal table name attempt
    try {
      const je = await (prisma as any).journalEntry.findMany({ where: { refType: 'PurchaseInvoice', refId: invId } })
      console.log('\nJournal entries for PurchaseInvoice:')
      console.dir(je, { depth: 6 })
    } catch (err) {
      console.log('\nNo `journalEntry` table or entries available (skipping).')
    }

  } catch (e: any) {
    console.error('Error:', e?.message ?? e)
  } finally {
    await app.close()
  }
}

run().catch(e => { console.error(e); process.exit(1) })
