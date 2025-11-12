const { PrismaClient } = require('@prisma/client');
(async function main(){
  const prisma = new PrismaClient();
  try {
    const invoice = await prisma.salesInvoice.findUnique({ where: { number: 1083 } });
    if (!invoice) return console.log('No invoice 1083');
    console.log('Invoice id=', invoice.id);

    const moves = await prisma.stockMove.findMany({
      where: { refType: 'SalesInvoice', refId: invoice.id, type: 'SALE' },
      orderBy: [{ id: 'asc' }],
    });
    console.log('stockMoves found:', moves.length);
    for (const mv of moves) {
      console.log('move id=', mv.id, 'itemId=', mv.itemId, 'qty=', mv.qty, 'unitCost=', mv.unitCost, 'warehouseId=', mv.warehouseId);
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: mv.id }, include: { lines: { include: { account: true } } } });
      if (!je) {
        console.log('  -> No JournalEntry for stockMove', mv.id);
      } else {
        console.log('  -> JournalEntry id=', je.id, 'date=', je.date, 'description=', je.description);
        console.log(JSON.stringify(je.lines, null, 2));
      }
    }
  } catch (e) {
    console.error(e);
  } finally { await prisma.$disconnect(); }
})();
