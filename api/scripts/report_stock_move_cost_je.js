const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const moveIds = [165,166,167,168];
    for(const mvId of moveIds){
      const mv = await prisma.stockMove.findUnique({ where: { id: mvId } });
      if(!mv){ console.log('stockMove not found', mvId); continue; }
      console.log('\n--- stockMove', mv.id, 'itemId', mv.itemId, 'qty', mv.qty.toString(), 'unitCost', (mv.unitCost||0).toString());

      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: mv.id }, include: { lines: true } });
      if(!je){ console.log('No STOCK_MOVE JE found for move', mv.id); continue; }
      console.log('Stock cost JE', je.id, 'date', je.date, 'desc', je.description);
      for(const l of je.lines){ console.log(`  - ${l.accountCode} debit:${l.debit||0} credit:${l.credit||0}`); }
    }
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
