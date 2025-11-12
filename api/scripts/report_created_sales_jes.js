const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const jeIds = [188,189,190,191];
    for(const id of jeIds){
      const je = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
      if(!je){ console.log('JournalEntry not found', id); continue; }
      console.log('\n=== JournalEntry', id, '===');
      console.log('date:', je.date);
      console.log('description:', je.description);
      console.log('sourceType/sourceId:', je.sourceType, je.sourceId);
      console.log('lines:');
      for(const l of je.lines){
        console.log(`  - account: ${l.accountCode}  debit: ${l.debit || 0}  credit: ${l.credit || 0}`);
      }

      const si = await prisma.salesInvoice.findUnique({ where: { id: je.sourceId }, include: { lines: true } });
      if(!si){ console.log('SalesInvoice not found for sourceId', je.sourceId); continue; }
      console.log('SalesInvoice id:', si.id, 'number:', si.number, 'total:', si.total.toString());
      console.log('invoice lines:');
      for(const ln of si.lines){
        console.log(`  - itemId:${ln.itemId} qty:${ln.qty.toString()} unitPrice:${ln.unitPrice.toString()} subtotal:${ln.lineSubtotal.toString()} vat:${ln.lineVat.toString()} total:${ln.lineTotal.toString()}`);
      }
    }
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
