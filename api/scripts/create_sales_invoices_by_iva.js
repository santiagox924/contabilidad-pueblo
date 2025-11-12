const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){ return Math.round((Number(n) + Number.EPSILON) * 100) / 100 }

(async()=>{
  try{
    await prisma.$connect();

    // find distinct ivaPct values and one item per ivaPct
    const items = await prisma.item.findMany({ where: { active: true }, select: { id: true, name: true, ivaPct: true, incomeAccountCode: true, taxAccountCode: true }, orderBy: { ivaPct: 'desc' } });
    const byIva = {};
    for(const it of items){
      const key = String(it.ivaPct || 0);
      if(!byIva[key]) byIva[key] = it;
    }
    const reps = Object.values(byIva);
    console.log('Found representative items for ivaPct:', reps.map(r => ({ id: r.id, name: r.name, ivaPct: r.ivaPct })));

    // find a cash payment method or default
    const pmCash = await prisma.paymentMethod.findFirst({ where: { cashAccountCode: { not: null } } });
    const cashAcc = pmCash ? pmCash.cashAccountCode : '110505';

    const created = [];
    for(const it of reps){
      const qty = 2;
      const unitPrice = 1000;
      const subtotal = r2(qty * unitPrice);
      const tax = r2(subtotal * ((it.ivaPct || 0)/100));
      const total = r2(subtotal + tax);

      const numberRow = await prisma.salesInvoice.findFirst({ select: { number: true }, orderBy: { number: 'desc' } });
      const nextNumber = (numberRow && numberRow.number) ? numberRow.number + 1 : 3000;

      const si = await prisma.salesInvoice.create({ data: {
        number: nextNumber,
        thirdPartyId: 1,
        issueDate: new Date(),
        paymentType: 'CASH',
        subtotal,
        tax,
        total,
        status: 'ISSUED',
        lines: { create: [{ itemId: it.id, qty: qty, unitPrice: unitPrice, vatPct: it.ivaPct || 0, lineSubtotal: subtotal, lineVat: tax, lineTotal: total }] }
      }, include: { lines: true } });

      // create JE
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'SALES_INVOICE', sourceId: si.id, description: `SI ${si.number} IVA ${it.ivaPct}` } });
      const salesAcct = it.incomeAccountCode || '413505';
      const ivaAcct = it.taxAccountCode || '240805';
      await prisma.journalLine.createMany({ data: [ { entryId: je.id, accountCode: cashAcc, debit: total, credit: 0 }, { entryId: je.id, accountCode: salesAcct, debit: 0, credit: subtotal }, { entryId: je.id, accountCode: ivaAcct, debit: 0, credit: tax } ] });

      console.log('\nCreated SI', si.id, 'number', si.number, 'for item', it.id, it.name, 'ivaPct', it.ivaPct);
      created.push({ si, jeId: je.id, salesAcct, ivaAcct, cashAcc });
    }

    console.log('\nDone. Created invoices:', created.map(c => ({ id: c.si.id, number: c.si.number, total: c.si.total.toString() })));

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
