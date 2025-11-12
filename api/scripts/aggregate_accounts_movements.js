const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    // get journal entries for purchases
    const purchases = await prisma.journalEntry.findMany({ where: { sourceType: 'PURCHASE_INVOICE' }, include: { lines: true } });
    const stockJes = await prisma.journalEntry.findMany({ where: { sourceType: 'STOCK_MOVE' }, include: { lines: true } });

    const purchasesAgg = {};
    for(const je of purchases){
      for(const l of je.lines){
        const code = l.accountCode;
        if(!purchasesAgg[code]) purchasesAgg[code] = { code, debit:0, credit:0 };
        purchasesAgg[code].debit += Number(l.debit);
        purchasesAgg[code].credit += Number(l.credit);
      }
    }

    const stockAgg = {};
    const salesAgg = {};
    // To separate stock moves into PURCHASE or SALE we lookup the stockMove by je.sourceId
    for(const je of stockJes){
      const mv = await prisma.stockMove.findUnique({ where: { id: je.sourceId } });
      const target = mv && mv.type === 'PURCHASE' ? stockAgg : mv && mv.type === 'SALE' ? salesAgg : stockAgg;
      for(const l of je.lines){
        const code = l.accountCode;
        if(!target[code]) target[code] = { code, debit:0, credit:0 };
        target[code].debit += Number(l.debit);
        target[code].credit += Number(l.credit);
      }
    }

    // resolve account names
    async function resolve(map){
      const out = [];
      for(const code of Object.keys(map)){
        const acct = await prisma.coaAccount.findUnique({ where: { code } });
        out.push({ code, name: acct ? acct.name : null, debit: map[code].debit, credit: map[code].credit });
      }
      return out.sort((a,b)=>a.code.localeCompare(b.code));
    }

    const purchasesResolved = await resolve(purchasesAgg);
    const stockResolved = await resolve(stockAgg);
    const salesResolved = await resolve(salesAgg);

    console.log('--- Purchases (PURCHASE_INVOICE) accounts moved ---');
    console.log(JSON.stringify(purchasesResolved, null, 2));

    console.log('\n--- Stock PURCHASE movements (STOCK_MOVE type PURCHASE) accounts moved ---');
    console.log(JSON.stringify(stockResolved, null, 2));

    console.log('\n--- Stock SALE movements (STOCK_MOVE type SALE) accounts moved ---');
    console.log(JSON.stringify(salesResolved, null, 2));

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
