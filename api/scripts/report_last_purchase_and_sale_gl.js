const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function fmt(n){ return Number(n||0).toFixed(2); }

(async()=>{
  try{
    await prisma.$connect();
    const lastPurchase = await prisma.purchaseInvoice.findFirst({ orderBy: { issueDate: 'desc' } });
    const lastSale = await prisma.salesInvoice.findFirst({ orderBy: { issueDate: 'desc' } });

    if(lastPurchase){
      console.log('\n=== Last Purchase ===');
      console.log('PurchaseInvoice', lastPurchase.id, 'number', lastPurchase.number, 'date', lastPurchase.issueDate, 'subtotal', lastPurchase.subtotal.toString(), 'tax', lastPurchase.tax.toString(), 'total', lastPurchase.total.toString());
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: lastPurchase.id }, include: { lines: true } });
      if(!je) console.log('  No JE found for last purchase');
      else{
        console.log('  JE', je.id, 'date', je.date);
        for(const l of je.lines) console.log(`    - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`);
      }
    } else console.log('No purchases found');

    if(lastSale){
      console.log('\n=== Last Sale ===');
      console.log('SalesInvoice', lastSale.id, 'number', lastSale.number, 'date', lastSale.issueDate, 'subtotal', lastSale.subtotal.toString(), 'tax', lastSale.tax.toString(), 'total', lastSale.total.toString());
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'SALES_INVOICE', sourceId: lastSale.id }, include: { lines: true } });
      if(!je) console.log('  No JE found for last sale');
      else{
        console.log('  JE', je.id, 'date', je.date);
        for(const l of je.lines) console.log(`    - ${l.accountCode}  debit:${fmt(l.debit)}  credit:${fmt(l.credit)}`);
      }
    } else console.log('No sales found');

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
