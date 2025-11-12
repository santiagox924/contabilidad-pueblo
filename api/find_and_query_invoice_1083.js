const { PrismaClient } = require('@prisma/client');
(async function main(){
  const prisma = new PrismaClient();
  try {
    const invoice = await prisma.salesInvoice.findUnique({ where: { number: 1083 } });
    if (!invoice) {
      console.log('No SalesInvoice found with number 1083');
      return;
    }
    console.log('Found SalesInvoice id=', invoice.id, 'number=', invoice.number);

    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: 'SALE_INVOICE', sourceId: invoice.id },
      include: { journal: true, lines: { include: { account: true, thirdParty: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    if (!entries || entries.length === 0) {
      console.log('No JournalEntry found for SalesInvoice id=', invoice.id);
      return;
    }

    console.log('JournalEntries found:', entries.length);
    console.log(JSON.stringify(entries, null, 2));

    // Aggregate by accountCode
    const agg = {}; // accountCode -> { debit: number, credit: number, name }
    for (const e of entries) {
      for (const l of e.lines) {
        const code = l.accountCode || (l.account && l.account.code) || 'UNKNOWN';
        const name = (l.account && l.account.name) || null;
        const debit = parseFloat(l.debit || 0);
        const credit = parseFloat(l.credit || 0);
        if (!agg[code]) agg[code] = { debit: 0, credit: 0, name };
        agg[code].debit += debit;
        agg[code].credit += credit;
      }
    }

    console.log('\nSummary by accountCode:');
    for (const [code, v] of Object.entries(agg)) {
      console.log(code, 'name=', v.name || '-', 'totalDebit=', v.debit.toFixed(2), 'totalCredit=', v.credit.toFixed(2));
    }

  } catch (e) {
    console.error('ERROR', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
