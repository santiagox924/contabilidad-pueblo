const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async ()=>{
  try{
    await prisma.$connect();
    const jeIds = [180,181,182,183];
    const out = [];
    for(const id of jeIds){
      const je = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
      if(!je) { out.push({ jeId: id, found: false }); continue; }
      const lines = [];
      for(const l of je.lines){
        const acct = await prisma.coaAccount.findUnique({ where: { code: l.accountCode } });
        lines.push({ accountCode: l.accountCode, accountName: acct ? acct.name : null, debit: Number(l.debit), credit: Number(l.credit) });
      }
      out.push({ jeId: je.id, sourceId: je.sourceId, lines });
    }
    console.log(JSON.stringify(out, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
