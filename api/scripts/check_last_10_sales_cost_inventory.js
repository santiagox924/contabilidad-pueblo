const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function fmt(n){ return Number(n||0).toFixed(2); }

(async()=>{
  try{
    await prisma.$connect();
    const sales = await prisma.salesInvoice.findMany({ orderBy: { id: 'desc' }, take: 10 });
    for(const s of sales){
      console.log('\n=== SalesInvoice', s.id, 'number', s.number, 'total', s.total.toString(), 'date', s.issueDate);
      // Find stock moves that reference this sales invoice
      const moves = await prisma.stockMove.findMany({ where: { OR: [ { refType: 'SalesInvoice', refId: s.id }, { refType: 'SALES_INVOICE', refId: s.id }, { refType: 'AUTO_TEST_SALE', refId: s.id }, { refType: 'TEST_SALE', refId: s.id } ] } });
      if(moves.length === 0){ console.log('  No stock moves reference this SalesInvoice (refType/refId)'); }
      for(const mv of moves){
        console.log('  - stockMove', mv.id, 'item', mv.itemId, 'qty', mv.qty.toString(), 'unitCost', mv.unitCost.toString(), 'refType', mv.refType);
        const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: mv.id }, include: { lines: true } });
        if(!je){ console.log('    No STOCK_MOVE JE found for move', mv.id); continue; }
        console.log('    STOCK_MOVE JE', je.id, 'date', je.date);
        for(const l of je.lines){ console.log(`      - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`); }
      }
    }
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
