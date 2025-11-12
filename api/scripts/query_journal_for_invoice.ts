import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: 'PURCHASE_INVOICE' },
      include: { lines: true },
      orderBy: { id: 'desc' },
      take: 1,
    });
  console.log('journal entries for PURCHASE_INVOICE found:', entries.length);
    if (!entries.length) {
      console.log('no purchase invoice journal entries found');
    } else {
      const e = entries[0];
      console.log('Latest Entry id=', e.id, 'date=', e.date, 'desc=', e.description);
      for (const ln of e.lines) {
        console.log(' ', ln.accountCode, 'debit=', ln.debit?.toString() ?? null, 'credit=', ln.credit?.toString() ?? null);
      }
    }
  } catch (e) {
    console.error('error querying journalEntry:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
