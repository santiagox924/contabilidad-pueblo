const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TO_BASE = {
  MG: 0.001,
  G: 1,
  KG: 1000,
  ML: 1,
  L: 1000,
};
function assertSameFamily(a, b) {
  const weight = ['MG','G','KG','LB'];
  if (weight.includes(a) && weight.includes(b)) return;
  if (a === b) return;
  throw new Error('Unit families mismatch for ' + a + ' vs ' + b);
}
function convertToBase(qty, from, base) {
  if (!from || !base) return qty;
  if (from === base) return qty;
  assertSameFamily(from, base);
  const inBase = qty * (TO_BASE[from] ?? 1);
  const factor = 1 / (TO_BASE[base] ?? 1);
  return inBase * factor;
}
function r2(n){return Math.round((n+Number.EPSILON)*100)/100}

(async function main(){
  try {
    const name = 'arroz';
    const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
    if (!item) return console.log('No item found with name containing', name);
    console.log('Item:', item.id, item.name, 'baseUnit=', item.baseUnit, 'displayUnit=', item.displayUnit);

    const moves = await prisma.stockMove.findMany({ where: { itemId: item.id }, orderBy: { id: 'asc' } });
    if (!moves.length) return console.log('No stock moves for item', item.id);

    console.log('\nFound', moves.length, 'stockMoves:');
    for (const mv of moves) {
      const qty = Number(mv.qty || 0);
      const uom = mv.uom || item.displayUnit || item.baseUnit;
      const qtyBase = convertToBase(Math.abs(qty), uom, item.baseUnit);
      const rawUnitCost = Number(mv.unitCost || 0);
      const factor = convertToBase(1, uom, item.baseUnit);
      const expectedUnitCostBase = factor > 0 ? r2(rawUnitCost / factor) : rawUnitCost;

      const amountActual = r2(Math.abs(qty) * rawUnitCost);
      const amountExpected = r2(qtyBase * expectedUnitCostBase);
      const diff = r2(amountActual - amountExpected);

      console.log('\n- move id=', mv.id, 'type=', mv.type, 'ref=', mv.refType + '#' + mv.refId);
      console.log('  qty=', qty, uom, 'qtyBase=', qtyBase, item.baseUnit);
      console.log('  unitCost stored=', rawUnitCost, uom, ' -> expected unitCost per', item.baseUnit, '=', expectedUnitCostBase);
      console.log('  amountActual=', amountActual, ' amountExpected=', amountExpected, ' diff=', diff);

      // show related journal entries
      const jeStock = await prisma.journalEntry.findMany({ where: { sourceType: 'STOCK_MOVE', sourceId: mv.id }, include: { lines: { include: { account: true } } } });
      console.log('  STOCK_MOVE JournalEntries:', jeStock.length);
      for (const je of jeStock) {
        console.log('    JE', je.id, je.description, 'date=', je.date);
        for (const ln of je.lines) console.log('      ', ln.accountCode, 'debit=', ln.debit, 'credit=', ln.credit);
      }

      // if refType points to purchase or sale, show sale/purchase JE too
      if (mv.refType === 'SalesInvoice') {
        const jeSale = await prisma.journalEntry.findMany({ where: { sourceType: 'SALE_INVOICE', sourceId: mv.refId }, include: { lines: true } });
        console.log('  Related SALE_INVOICE JournalEntries:', jeSale.length);
        for (const je of jeSale) console.log('    JE', je.id, 'desc=', je.description);
      }
      if (mv.refType === 'PurchaseInvoice') {
        const jePur = await prisma.journalEntry.findMany({ where: { sourceType: 'PURCHASE_INVOICE', sourceId: mv.refId }, include: { lines: true } });
        console.log('  Related PURCHASE_INVOICE JournalEntries:', jePur.length);
        for (const je of jePur) console.log('    JE', je.id, 'desc=', je.description);
      }
    }

    console.log('\nReport complete.');
  } catch (e) {
    console.error(e);
  } finally { await prisma.$disconnect(); }
})();
