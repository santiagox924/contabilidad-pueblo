const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const saleJeIds = [180,181,182,183];
    const report = { sales: [], layers: [] };
    for(const id of saleJeIds){
      const je = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
      if(je) report.sales.push({ id: je.id, sourceId: je.sourceId, lines: je.lines.map(l=>({ accountCode: l.accountCode, debit: Number(l.debit), credit: Number(l.credit) })) });
    }
    const layers = await prisma.stockLayer.findMany({ where: { id: { in: [39,40,41,42] } }, orderBy: { id: 'asc' } });
    report.layers = layers.map(l=>({ id: l.id, itemId: l.itemId, remainingQty: Number(l.remainingQty), unitCost: Number(l.unitCost), moveInId: l.moveInId }));
    console.log(JSON.stringify(report, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
