const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const siIds = [104,105,106];
    for(const id of siIds){
      const si = await prisma.salesInvoice.findUnique({ where: { id }, include: { lines: true } });
      if(!si) { console.log('SI not found', id); continue; }
      console.log('\n=== SalesInvoice', si.id, 'number', si.number, 'total', si.total.toString(), 'subtotal', si.subtotal.toString(), 'tax', si.tax.toString(), 'paymentType', si.paymentType);
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'SALES_INVOICE', sourceId: si.id }, include: { lines: true } });
      if(!je) { console.log('No JE found for SI', si.id); continue; }
      console.log('JE', je.id, 'date', je.date, 'desc', je.description);
      for(const l of je.lines){ console.log(`  - ${l.accountCode}  debit:${l.debit || 0}  credit:${l.credit || 0}`); }
    }
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
