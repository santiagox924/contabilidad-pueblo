const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try{
    await prisma.$connect();
    // buscaremos por journalEntry ids que ya conocemos (172..175)
    const jeIds = [172,173,174,175];
    const entries = await prisma.journalEntry.findMany({ where: { id: { in: jeIds } }, include: { lines: true } });
    if(entries.length === 0){ console.log('No journal entries found'); return; }

    const perEntry = [];
    const perAccountImpact = {};
    for(const e of entries){
      const totalDebit = e.lines.reduce((s,l)=>s+Number(l.debit),0);
      const totalCredit = e.lines.reduce((s,l)=>s+Number(l.credit),0);
      perEntry.push({ journalEntryId: e.id, sourceType: e.sourceType, sourceId: e.sourceId, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.0001 });

      for(const l of e.lines){
        const code = l.accountCode;
        if(!perAccountImpact[code]) perAccountImpact[code] = { debit:0, credit:0 };
        perAccountImpact[code].debit += Number(l.debit);
        perAccountImpact[code].credit += Number(l.credit);
      }
    }

    // ahora obtener saldo actual del libro mayor para las cuentas afectadas (sum debit - credit de todas las journalLines)
    const accountCodes = Object.keys(perAccountImpact);
    const accountBalances = {};
    for(const ac of accountCodes){
      const agg = await prisma.journalLine.aggregate({ where: { accountCode: ac }, _sum: { debit: true, credit: true } });
      const sumDebit = agg._sum.debit ? Number(agg._sum.debit) : 0;
      const sumCredit = agg._sum.credit ? Number(agg._sum.credit) : 0;
      accountBalances[ac] = { sumDebit, sumCredit, balance: sumDebit - sumCredit };
    }

    console.log('\nPer-entry balance check:');
    console.log(JSON.stringify(perEntry, null, 2));

    console.log('\nImpacto combinado por cuenta (sólo asientos de prueba):');
    const combined = accountCodes.map(code=>({ accountCode: code, debit: perAccountImpact[code].debit, credit: perAccountImpact[code].credit }));
    console.log(JSON.stringify(combined, null, 2));

    console.log('\nSaldos actuales en libro mayor para esas cuentas:');
    console.log(JSON.stringify(accountBalances, null, 2));

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
