const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){ return Math.round((n + Number.EPSILON) * 100) / 100 }

(async()=>{
  try{
    await prisma.$connect();
    const moveIds = [165,166,167,168];
    // find a payment method with cashAccountCode
    const pmCash = await prisma.paymentMethod.findFirst({ where: { cashAccountCode: { not: null } } });
    const cashAcc = pmCash ? pmCash.cashAccountCode : '110505';

    const created = [];
    for(const mvId of moveIds){
      const mv = await prisma.stockMove.findUnique({ where: { id: mvId } });
      if(!mv) { console.log('stockMove not found', mvId); continue; }

      const item = await prisma.item.findUnique({ where: { id: mv.itemId } });
      const unitCost = Number(mv.unitCost || 0);
      const price = r2(unitCost * 1.5);
      const qty = Math.abs(Number(mv.qty));
      const subtotal = r2(price * qty);
      const ivaPct = item?.ivaPct ?? 0;
      const tax = r2(subtotal * ivaPct / 100);
      const total = r2(subtotal + tax);

      // create SalesInvoice
      const numberRow = await prisma.salesInvoice.findFirst({ select: { number: true }, orderBy: { number: 'desc' } });
      const nextNumber = (numberRow && numberRow.number) ? numberRow.number + 1 : 2000;
      const si = await prisma.salesInvoice.create({ data: {
        number: nextNumber,
        thirdPartyId: 1,
        issueDate: new Date(),
        paymentType: 'CASH',
        subtotal,
        tax,
        total,
        status: 'ISSUED',
        lines: { create: [{ itemId: mv.itemId, qty: qty, unitPrice: price, vatPct: ivaPct, lineSubtotal: subtotal, lineVat: tax, lineTotal: total }] }
      }, include: { lines: true } });

      // create JE for sales invoice: debit cash (cashAcc) by total, credit sales by subtotal, credit IVA by tax
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'SALES_INVOICE', sourceId: si.id, description: `SI ${si.number} for mv ${mv.id}`, status: 'POSTED' } });
      const salesAcct = item?.incomeAccountCode || '413505';
      const ivaAcct = item?.taxAccountCode || '240805';
      await prisma.journalLine.createMany({ data: [ { entryId: je.id, accountCode: cashAcc, debit: total, credit: 0 }, { entryId: je.id, accountCode: salesAcct, debit: 0, credit: subtotal }, { entryId: je.id, accountCode: ivaAcct, debit: 0, credit: tax } ] });

      created.push({ moveId: mv.id, salesInvoiceId: si.id, journalEntryId: je.id, subtotal, tax, total, salesAcct, ivaAcct, cashAcc });
      console.log('Created SI', si.id, 'JE', je.id, 'for mv', mv.id);
    }

    console.log('Done:', created);
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
