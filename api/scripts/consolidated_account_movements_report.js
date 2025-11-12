const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function fmt(n){ return Number(n || 0).toFixed(2); }

(async()=>{
  try{
    await prisma.$connect();

    // We'll collect JE lines for relevant source types
  const jlines = await prisma.journalLine.findMany({ where: { entry: { sourceType: { in: ['PURCHASE_INVOICE','SALES_INVOICE','STOCK_MOVE'] } } }, include: { entry: true }, orderBy: { entryId: 'asc' } });

    // Group by source (sourceType + sourceId)
    const bySource = {};
    for(const l of jlines){
      const key = `${l.entry.sourceType}:${l.entry.sourceId}`;
      bySource[key] = bySource[key] || { sourceType: l.entry.sourceType, sourceId: l.entry.sourceId, entries: [], totals: {} };
      bySource[key].entries.push(l);
      const acct = l.accountCode || 'UNKNOWN';
      bySource[key].totals[acct] = bySource[key].totals[acct] || { debit: 0, credit: 0 };
      bySource[key].totals[acct].debit += Number(l.debit || 0);
      bySource[key].totals[acct].credit += Number(l.credit || 0);
    }

    // Print per-source summary
    console.log('Per-source account movements (PURCHASE_INVOICE, SALES_INVOICE, STOCK_MOVE)');
    for(const k of Object.keys(bySource)){
      const s = bySource[k];
      console.log('\n---', s.sourceType, 'id', s.sourceId, '---');
      console.log('Accounts moved:');
      for(const acct of Object.keys(s.totals)){
        console.log(`  - ${acct}  debit:${fmt(s.totals[acct].debit)}  credit:${fmt(s.totals[acct].credit)}`);
      }
    }

    // Global aggregates per account
    const global = {};
    for(const k of Object.keys(bySource)){
      for(const acct of Object.keys(bySource[k].totals)){
        global[acct] = global[acct] || { debit: 0, credit: 0 };
        global[acct].debit += bySource[k].totals[acct].debit;
        global[acct].credit += bySource[k].totals[acct].credit;
      }
    }

    console.log('\n\n=== Aggregate by account across all these sources ===');
    const sorted = Object.keys(global).sort();
    for(const acct of sorted){ console.log(`${acct}  debit:${fmt(global[acct].debit)}  credit:${fmt(global[acct].credit)}`); }

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
