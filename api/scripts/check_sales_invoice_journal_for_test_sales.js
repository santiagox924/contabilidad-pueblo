const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const testSaleMvIds = [165,166,167,168];
    const missing = [];
    for(const mvId of testSaleMvIds){
      const jeSI = await prisma.journalEntry.findFirst({ where: { sourceType: 'SALES_INVOICE', sourceId: mvId } });
      if(!jeSI) missing.push(mvId);
    }

    console.log('Sale moves without SALES_INVOICE JE (from test list):', missing);

    // Now list last 10 SalesInvoice and their JE lines
    const salesInv = await prisma.salesInvoice.findMany({ orderBy: { id: 'desc' }, take: 10 });
    const salesReport = [];
    for(const si of salesInv){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'SALES_INVOICE', sourceId: si.id }, include: { lines: true } });
      salesReport.push({ salesInvoiceId: si.id, number: si.number, issueDate: si.issueDate, paymentType: si.paymentType, journalEntryId: je ? je.id : null, lines: je ? je.lines.map(l=>({ accountCode: l.accountCode, debit: Number(l.debit), credit: Number(l.credit) })) : [] });
    }

    console.log('\nLast SalesInvoices and their JE lines:');
    console.log(JSON.stringify(salesReport, null, 2));

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
