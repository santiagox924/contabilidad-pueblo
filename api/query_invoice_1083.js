const { PrismaClient } = require('@prisma/client');
(async function main(){
  const prisma = new PrismaClient();
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: 'SALE_INVOICE', sourceId: 1083 },
      include: { journal: true, lines: { include: { account: true, thirdParty: true } } },
      orderBy: { date: 'asc' },
    });
    console.log(JSON.stringify(entries, null, 2));
  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
