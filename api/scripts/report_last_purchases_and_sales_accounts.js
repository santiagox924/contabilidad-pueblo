const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();

    // Last 10 purchases
    const purchases = await prisma.purchaseInvoice.findMany({ orderBy: { id: 'desc' }, take: 10 });
    const purchasesReport = [];
    for(const p of purchases){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: p.id }, include: { lines: true } });
      const lines = [];
      if(je){
        for(const l of je.lines){
          const acct = await prisma.coaAccount.findUnique({ where: { code: l.accountCode } });
          lines.push({ accountCode: l.accountCode, accountName: acct ? acct.name : null, debit: Number(l.debit), credit: Number(l.credit) });
        }
      }
      purchasesReport.push({ invoiceId: p.id, number: p.number, issueDate: p.issueDate, paymentType: p.paymentType, journalEntryId: je ? je.id : null, lines });
    }

    // Last 10 sale stock moves
    const salesMoves = await prisma.stockMove.findMany({ where: { type: 'SALE' }, orderBy: { id: 'desc' }, take: 10 });
    const salesReport = [];
    for(const mv of salesMoves){
      const je = await prisma.journalEntry.findFirst({ where: { sourceType: 'STOCK_MOVE', sourceId: mv.id }, include: { lines: true } });
      const lines = [];
      if(je){
        for(const l of je.lines){
          const acct = await prisma.coaAccount.findUnique({ where: { code: l.accountCode } });
          lines.push({ accountCode: l.accountCode, accountName: acct ? acct.name : null, debit: Number(l.debit), credit: Number(l.credit) });
        }
      }
      salesReport.push({ stockMoveId: mv.id, itemId: mv.itemId, qty: Number(mv.qty), uom: mv.uom, journalEntryId: je ? je.id : null, lines });
    }

    console.log(JSON.stringify({ purchases: purchasesReport, sales: salesReport }, null, 2));

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
