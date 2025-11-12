import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const it = await prisma.item.create({
      data: {
        sku: 'TEST-PT-001',
        name: 'Test item purchase tax',
        type: 'PRODUCT',
        purchaseTaxAccountCode: '240801',
      },
    });
    console.log('created item', it.id, it.purchaseTaxAccountCode);
  } catch (e) {
    console.error('error creating item', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
