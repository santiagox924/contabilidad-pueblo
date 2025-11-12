const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = { MG:0.001,G:1,KG:1000,ML:1,L:1000,CM3:1, M:1000, MM:1, CM:10 };
function convertToBase(qty, from, base) {
  if (!from || !base) return qty;
  if (from === base) return qty;
  const inBase = qty * (TO_BASE[from] ?? 1);
  const factor = 1 / (TO_BASE[base] ?? 1);
  return inBase * factor;
}
function r2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100 }
(async()=>{
  try {
    const name = 'arroz';
    const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
    if (!item) return console.log('No item found', name);
    const warehouseId = 1;
    const qtyToSell = 100; // grams
    const inputUom = 'G';
    const qtyBase = convertToBase(qtyToSell, inputUom, item.baseUnit);
    console.log('Selling', qtyToSell, inputUom, '-> qtyBase=', qtyBase, item.baseUnit);

    // load layers FEFO
    const layers = await prisma.stockLayer.findMany({ where: { itemId: item.id, warehouseId, remainingQty: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] });
    if (!layers.length) return console.log('No layers available');

    let remaining = qtyBase;
    const parts = [];
    for (const l of layers) {
      if (remaining <= 0) break;
      const avail = Number(l.remainingQty);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      parts.push({ layerId: l.id, qty: take, unitCost: Number(l.unitCost) });
      remaining = r2(remaining - take);
    }
    if (remaining > 0) return console.log('Not enough stock to sell', remaining, item.baseUnit);

    const weighted = parts.reduce((s,p)=>s + p.qty * p.unitCost, 0);
    const consumed = parts.reduce((s,p)=>s + p.qty, 0);
    const avgCost = consumed > 0 ? r2(weighted / consumed) : 0;

    // create sale move
    const mv = await prisma.stockMove.create({ data: { itemId: item.id, warehouseId, type: 'SALE', qty: -consumed, uom: item.baseUnit, unitCost: avgCost, refType: 'TEST_SALE', refId: null, note: 'Test sale script' } });

    // create consumptions and decrement layers
    for (const p of parts) {
      await prisma.stockConsumption.create({ data: { moveOutId: mv.id, layerId: p.layerId, itemId: item.id, warehouseId, qty: p.qty, unitCost: p.unitCost } });
      await prisma.stockLayer.update({ where: { id: p.layerId }, data: { remainingQty: { decrement: p.qty } } });
    }

    const amount = Math.abs(mv.qty * Number(mv.unitCost));
    const inventoryAccount = item.inventoryAccountCode || '143505';
    const cogsAccount = item.expenseAccountCode || '613505';

    // create JE
    const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mv.id, description: `Test sale ${qtyToSell}${inputUom} item#${item.id}` } });
    await prisma.journalLine.create({ data: { entryId: je.id, accountCode: cogsAccount, debit: amount, credit: 0 } });
    await prisma.journalLine.create({ data: { entryId: je.id, accountCode: inventoryAccount, debit: 0, credit: amount } });

    console.log('Created move id=', mv.id, 'avgCost=', avgCost, 'amount=', amount, 'JE id=', je.id);

    // show updated layers
    const newLayers = await prisma.stockLayer.findMany({ where: { itemId: item.id }, orderBy: { id: 'asc' } });
    console.log('Layers after sale:');
    for (const l of newLayers) console.log(' layer', l.id, 'rem=', l.remainingQty.toString(), 'unitCost=', l.unitCost.toString());

    // show sale move JE
    const jeLines = await prisma.journalLine.findMany({ where: { entryId: je.id } });
    console.log('JE lines:');
    for (const ln of jeLines) console.log(' ', ln.accountCode, 'debit=', ln.debit.toString(), 'credit=', ln.credit.toString());

  } catch (e) { console.error(e); }
  finally { await prisma.$disconnect(); }
})();