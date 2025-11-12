import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PurchasesService } from '../src/purchases/purchases.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const prisma = app.get(PrismaService);
  const purchases = app.get(PurchasesService);

  // create item and provider
  const item = await prisma.item.create({
    data: {
      sku: `TEST-IVA-${Date.now()}`,
      name: 'TEST ITEM IVA 19',
      type: 'PRODUCT',
      baseUnit: 'UN',
      unitKind: 'COUNT',
      ivaPct: 19,
    },
  });
  const tp = await prisma.thirdParty.create({
    data: {
      name: `TP-${Date.now()}`,
      roles: ['PROVIDER'],
      document: 'N/A',
      type: 'OTHER',
      idType: 'OTHER',
    },
  });

  const dto: any = {
    thirdPartyId: tp.id,
    issueDate: new Date().toISOString(),
    paymentType: 'CASH',
    lines: [
      {
        itemId: item.id,
        qty: 2,
        unitCost: 1000,
        // vatPct omitted intentionally
      },
    ],
  };

  console.log('Calling PurchasesService.create with line missing vatPct...');
  const created = await purchases.create(dto);
  console.log('Created invoice id:', created.id);
  const line = created.lines[0];
  console.log('Persisted line.vatPct =', line.vatPct, ' expected 19');

  // cleanup
  await prisma.purchaseInvoiceLine.deleteMany({ where: { invoiceId: created.id } });
  await prisma.purchaseInvoice.delete({ where: { id: created.id } });
  await prisma.thirdParty.delete({ where: { id: tp.id } });
  await prisma.item.delete({ where: { id: item.id } });

  await app.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
