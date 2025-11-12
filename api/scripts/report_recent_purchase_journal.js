const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try{
    await prisma.$connect();
    const invoiceIds = [19,20,21,22];
    const report = [];
    for(const id of invoiceIds){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: id }, include: { lines: true } });
      if (!je) { report.push({ invoiceId: id, found: false }); continue; }
      const creditLines = je.lines.filter(l => Number(l.credit) > 0).map(l => ({ accountCode: l.accountCode, credit: Number(l.credit) }));
      report.push({ invoiceId: id, journalEntryId: je.id, creditLines });
    }
    console.log(JSON.stringify(report, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
