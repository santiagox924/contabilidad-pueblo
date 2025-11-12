const { PrismaClient } = require('@prisma/client');
(async function(){
  const prisma = new PrismaClient();
  try {
    const name = 'arroz';
    const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
    if (!item) return console.log('No item found with name containing', name);
    console.log('Item:', item.id, item.name, 'baseUnit=', item.baseUnit, 'displayUnit=', item.displayUnit);

    const purchases = await prisma.purchaseInvoice.findMany({
      where: { lines: { some: { itemId: item.id } } },
      include: { lines: true },
      orderBy: { issueDate: 'asc' },
    });
    console.log('Purchases with this item:', purchases.length);
    for (const p of purchases) {
      console.log('Purchase', p.number, 'id=', p.id, 'subtotal=', p.subtotal, 'total=', p.total);
      const moves = await prisma.stockMove.findMany({ where: { refType: 'PurchaseInvoice', refId: p.id } });
      console.log('  stockMoves:', moves.length);
      for (const m of moves) console.log('   mv', m.id, m.qty, m.unitCost, m.uom);
    }

    const sales = await prisma.salesInvoice.findMany({ where: { lines: { some: { itemId: item.id } } }, include: { lines: true }, orderBy: { issueDate: 'asc' } });
    console.log('Sales with this item:', sales.length);
    for (const s of sales) {
      console.log('Sale', s.number, 'id=', s.id, 'subtotal=', s.subtotal, 'total=', s.total);
      const smoves = await prisma.stockMove.findMany({ where: { refType: 'SalesInvoice', refId: s.id } });
      console.log('  stockMoves:', smoves.length);
      for (const m of smoves) console.log('   mv', m.id, m.qty, m.unitCost, m.uom);

      const je = await prisma.journalEntry.findMany({ where: { sourceType: 'SALE_INVOICE', sourceId: s.id }, include: { lines: true } });
      console.log('  sale journal entries:', je.length);
      for (const e of je) {
        console.log('   JE', e.id, e.description);
        for (const l of e.lines) console.log('     line', l.accountCode, l.debit, l.credit);
      }

      // stock move journal entries
      for (const m of smoves) {
        const je2 = await prisma.journalEntry.findMany({ where: { sourceType: 'STOCK_MOVE', sourceId: m.id }, include: { lines: true } });
        for (const e of je2) {
          console.log('   STOCK JE', e.id, e.description);
          for (const l of e.lines) console.log('     line', l.accountCode, l.debit, l.credit);
        }
      }
    }

  } catch (e) {
    console.error(e);
  } finally { await prisma.$disconnect(); }
})();
