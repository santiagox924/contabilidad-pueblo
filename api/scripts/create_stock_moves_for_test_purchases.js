const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){return Math.round((n+Number.EPSILON)*100)/100}

(async function main(){
  try{
    await prisma.$connect();
    const invoiceIds = [19,20,21,22];
    const created = [];
    for(const invId of invoiceIds){
      const inv = await prisma.purchaseInvoice.findUnique({ where: { id: invId }, include: { lines: true } });
      if(!inv){ console.log('Invoice not found', invId); continue; }
      for(const line of inv.lines){
        const qty = Number(line.qty) === 0 ? 1 : Number(line.qty);
        const unitCost = Number(line.unitCost);
        const sm = await prisma.stockMove.create({ data: { itemId: line.itemId, warehouseId: 1, type: 'PURCHASE', qty: qty, uom: 'UN', unitCost: unitCost, refType: 'PurchaseInvoice', refId: inv.id, note: `Auto stock move for invoice ${inv.number} line ${line.id}` } });
        const amount = r2(qty * unitCost);
        const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: sm.id, description: `Auto JE stock move ${sm.id} for inv ${inv.id}`, status: 'POSTED' } });
        const lines = [ { accountCode: '143505', debit: amount, credit: 0 }, { accountCode: '613505', debit: 0, credit: amount } ];
        for(const l of lines) await prisma.journalLine.create({ data: { entryId: je.id, accountCode: l.accountCode, debit: l.debit, credit: l.credit } });
        created.push({ invoiceId: inv.id, stockMoveId: sm.id, journalEntryId: je.id, itemId: line.itemId, qty, unitCost, amount });
        console.log('Created stockMove', sm.id, 'and JE', je.id, 'for invoice', inv.id);
      }
    }
    console.log('Done. Created summary:', created);
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
