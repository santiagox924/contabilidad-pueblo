const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function fmt(n){ return Number(n||0).toFixed(2); }

(async()=>{
  try{
    await prisma.$connect();

    console.log('\n=== Purchases (detailed) ===');
    const purchases = await prisma.purchaseInvoice.findMany({ orderBy: { id: 'asc' } });
    for(const p of purchases){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: p.id }, include: { lines: true } });
      console.log('\nPurchaseInvoice', p.id, 'number', p.number, 'date', p.issueDate, 'subtotal', p.subtotal.toString(), 'tax', p.tax.toString(), 'total', p.total.toString());
      if(!je) { console.log('  No JE found for purchase', p.id); continue; }
      console.log('  JE', je.id, 'desc', je.description, 'date', je.date);
      for(const l of je.lines){ console.log(`    - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`); }
    }

    console.log('\n\n=== Sales (detailed) ===');
    const sales = await prisma.salesInvoice.findMany({ orderBy: { id: 'asc' } });
    for(const s of sales){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'SALES_INVOICE', sourceId: s.id }, include: { lines: true } });
      console.log('\nSalesInvoice', s.id, 'number', s.number, 'date', s.issueDate, 'subtotal', s.subtotal.toString(), 'tax', s.tax.toString(), 'total', s.total.toString());
      if(!je) { console.log('  No JE found for sales invoice', s.id); continue; }
      console.log('  JE', je.id, 'desc', je.description, 'date', je.date);
      for(const l of je.lines){ console.log(`    - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`); }
    }

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
