const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try{
    await prisma.$connect();
    const smIds = [161,162,163,164];
    const report = [];
    for(const id of smIds){
      const sm = await prisma.stockMove.findUnique({ where: { id }, include: { item: true } });
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: id }, include: { lines: true } });
  const stockMoveObj = sm ? { id: sm.id, itemId: sm.itemId, qty: Number(sm.qty), uom: sm.uom, unitCost: Number(sm.unitCost), refType: sm.refType, refId: sm.refId } : null;
  const journalObj = je ? { id: je.id, lines: je.lines.map(l => ({ accountCode: l.accountCode, debit: Number(l.debit), credit: Number(l.credit) })) } : null;
  report.push({ stockMove: stockMoveObj, journalEntry: journalObj });
    }
    console.log(JSON.stringify(report, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
