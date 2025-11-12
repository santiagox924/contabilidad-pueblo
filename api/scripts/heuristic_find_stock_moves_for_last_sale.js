const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function fmt(n){ return Number(n||0).toFixed(2); }

(async()=>{
  try{
    await prisma.$connect();
    const lastSale = await prisma.salesInvoice.findFirst({ orderBy: { issueDate: 'desc' }, include: { lines: true } });
    if(!lastSale){ console.log('No sales found'); return; }
    console.log('\nLast sale:', lastSale.id, 'number', lastSale.number, 'date', lastSale.issueDate);

    const windowMs = 2 * 24 * 60 * 60 * 1000; // ±2 days
    const saleDate = new Date(lastSale.issueDate).getTime();
    for(const ln of lastSale.lines){
      const targetQty = Math.abs(Number(ln.qty));
      console.log('\n- Line item', ln.itemId, 'qty', ln.qty.toString(), 'unitPrice', ln.unitPrice.toString());
      // find candidate stock moves of type SALE within date window and same abs(qty)
      const from = new Date(saleDate - windowMs);
      const to = new Date(saleDate + windowMs);
      const candidates = await prisma.stockMove.findMany({ where: { itemId: ln.itemId, type: 'SALE', ts: { gte: from, lte: to } }, orderBy: { ts: 'asc' } });
      if(candidates.length === 0){ console.log('  No candidate stock moves in ±2 days'); continue; }
      for(const c of candidates){
        console.log('  candidate move', c.id, 'qty', c.qty.toString(), 'unitCost', c.unitCost.toString(), 'refType', c.refType, 'ts', c.ts);
        // check if qty magnitude matches
        if(Math.abs(Number(c.qty)) === targetQty){ console.log('    qty matches'); } else console.log('    qty differs (abs)', Math.abs(Number(c.qty)));
        const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: c.id }, include: { lines: true } });
        if(!je) console.log('    NO STOCK_MOVE JE for move', c.id);
        else{
          console.log('    STOCK_MOVE JE', je.id);
          for(const l of je.lines) console.log(`      - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`);
        }
      }
    }

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
