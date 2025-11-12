const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try{
    await prisma.$connect();
    const invoiceIds = [19,20,21,22];
    const out = [];
    for(const invId of invoiceIds){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: invId }, include: { lines: true } });
      if(!je){ out.push({ invoiceId: invId, note: 'no journal entry found' }); continue; }
      // extract pm id from description if present like '[pm:2]'
      const pmMatch = (je.description || '').match(/\[pm:(\d+)\]/);
      const pmId = pmMatch ? Number(pmMatch[1]) : null;
      const pm = pmId ? await prisma.paymentMethod.findUnique({ where: { id: pmId } }) : null;

      const lines = [];
      for(const l of je.lines){
        const acct = await prisma.coaAccount.findUnique({ where: { code: l.accountCode } });
        lines.push({ accountCode: l.accountCode, accountName: acct ? acct.name : null, debit: Number(l.debit), credit: Number(l.credit) });
      }
      out.push({ invoiceId: invId, journalEntryId: je.id, paymentMethod: pm ? { id: pm.id, name: pm.name, cashAccountCode: pm.cashAccountCode, bankAccountCode: pm.bankAccountCode } : null, lines });
    }
    console.log(JSON.stringify(out, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
