const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ACCOUNTS = {
  inventory: '143505',
  purchaseVat: '135530',
  ap: '220505',
};

function r2(n){return Math.round((n+Number.EPSILON)*100)/100}

async function resolveTreasuryAccountCode(methodId, preferred='cash'){
  // mimic accounting.service.resolveTreasuryAccountCode
  if (!methodId) return null;
  const pm = await prisma.paymentMethod.findUnique({ where: { id: methodId }, select: { cashAccountCode: true, bankAccountCode: true } });
  if (!pm) return null;
  if (preferred === 'bank' && pm.bankAccountCode) return pm.bankAccountCode;
  if (pm.cashAccountCode) return pm.cashAccountCode;
  if (pm.bankAccountCode) return pm.bankAccountCode;
  return null;
}

(async function main(){
  try{
    await prisma.$connect();
    const methods = await prisma.paymentMethod.findMany({ where: { active: true }, select: { id: true, name: true, cashAccountCode: true, bankAccountCode: true } });
    console.log('Found payment methods:', methods.map(m=>({id:m.id,name:m.name,cash:m.cashAccountCode,bank:m.bankAccountCode})));

    let supplier = await prisma.thirdParty.findFirst({ where: { roles: { has: 'PROVIDER' } } });
    if (!supplier) supplier = await prisma.thirdParty.create({ data: { name: 'Proveedor prueba PM', document: '900000001', roles: ['PROVIDER'] } });

    for(const m of methods){
      console.log('\n--- Creating purchase with payment method:', m.id, m.name, '---');
      const item = await prisma.item.findFirst({ where: { }, select: { id: true, name: true, baseUnit: true } });
      if (!item){ console.log('No item found'); break; }
      const qty = 1;
      const unitCost = 1000;
      const subtotal = r2(qty*unitCost);
      const tax = r2(subtotal*0.19);
      const total = r2(subtotal+tax);

      const numberRow = await prisma.purchaseInvoice.findFirst({ select: { number: true }, orderBy: { number: 'desc' } });
      const nextNumber = (numberRow && numberRow.number) ? numberRow.number + 1 : 7000;

      const inv = await prisma.purchaseInvoice.create({ data: {
        number: nextNumber,
        thirdPartyId: supplier.id,
        issueDate: new Date(),
        dueDate: null,
        paymentType: 'CASH',
        subtotal,
        tax,
        total,
        status: 'ISSUED',
        lines: { create: [{ itemId: item.id, qty, unitCost, vatPct: 19, lineSubtotal: subtotal, lineVat: tax, lineTotal: total }] },
      }, include: { lines: true } });

      // Create CxP as fallback (some flows expect it)
      await prisma.accountsPayable.create({ data: { thirdPartyId: supplier.id, invoiceId: inv.id, balance: inv.total } });

      // Resolve treasury account code for the payment method
      const treasury = await resolveTreasuryAccountCode(m.id, 'cash');
      const treasuryUsed = treasury || ACCOUNTS.ap;

      // Create JournalEntry
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'PURCHASE_INVOICE', sourceId: inv.id, description: `FC ${inv.number} [pm:${m.id}]`, status: 'POSTED' } });
      const lines = [];
      lines.push({ accountCode: ACCOUNTS.inventory, debit: subtotal, credit: 0 });
      if (tax>0) lines.push({ accountCode: ACCOUNTS.purchaseVat, debit: tax, credit: 0 });
      lines.push({ accountCode: treasuryUsed, debit: 0, credit: r2(total) });

      for(const l of lines) await prisma.journalLine.create({ data: { entryId: je.id, accountCode: l.accountCode, debit: l.debit, credit: l.credit } });

      console.log('Invoice', inv.id, 'number', inv.number, 'total', inv.total, 'treasuryResolved=', treasury, 'treasuryUsed=', treasuryUsed, 'journalEntryId=', je.id);
      console.log('Journal lines:');
      for(const l of lines) console.log(' ', l.accountCode, l.debit?`debit=${l.debit}`:`credit=${l.credit}`);
    }
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
