const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = { MG:0.001,G:1,KG:1000,ML:1,L:1000 };
function r2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100 }
function convertToBase(qty, from, base) { if (!from||!base) return qty; if (from===base) return qty; const inBase = qty*(TO_BASE[from]??1); const factor = 1/(TO_BASE[base]??1); return inBase*factor; }
(async()=>{
  try {
    const name = 'arroz';
    const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
    if (!item) return console.log('No item');
    console.log('Item', item.id, item.name, 'baseUnit', item.baseUnit);

    const warehouseId = 1;
    // Create a temporary incoming adjustment layer of 1000 g at unitCost 1.5 per g (if needed)
    const tmpMove = await prisma.stockMove.create({ data: { itemId: item.id, warehouseId, type: 'ADJUSTMENT', qty: 1000, uom: item.baseUnit, unitCost: 1.5, note: 'Test seed layer for 300g vs 0.3kg' } });
    const tmpLayer = await prisma.stockLayer.create({ data: { itemId: item.id, warehouseId, remainingQty: 1000, unitCost: 1.5, moveInId: tmpMove.id } });
    console.log('Inserted temp layer move', tmpMove.id, 'layer', tmpLayer.id);

    // Helper to perform sale and print results
    async function doSale(qty, uom) {
      const qtyBase = convertToBase(qty, uom, item.baseUnit);
      // consume FEFO
      const layers = await prisma.stockLayer.findMany({ where: { itemId: item.id, warehouseId, remainingQty: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] });
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
      if (remaining > 0) throw new Error('not enough stock');
      const weighted = parts.reduce((s,p)=>s + p.qty * p.unitCost, 0);
      const consumed = parts.reduce((s,p)=>s + p.qty, 0);
      const avgCost = consumed>0? r2(weighted/consumed) : 0;

      const mv = await prisma.stockMove.create({ data: { itemId: item.id, warehouseId, type: 'SALE', qty: -consumed, uom: item.baseUnit, unitCost: avgCost, refType: 'TEST_SALE_300', refId: null, note: `Test sale ${qty}${uom}` } });
      for (const p of parts) {
        await prisma.stockConsumption.create({ data: { moveOutId: mv.id, layerId: p.layerId, itemId: item.id, warehouseId, qty: p.qty, unitCost: p.unitCost } });
        await prisma.stockLayer.update({ where: { id: p.layerId }, data: { remainingQty: { decrement: p.qty } } });
      }
      const amount = Math.abs(mv.qty * Number(mv.unitCost));
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mv.id, description: `Test sale ${qty}${uom}` } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: item.expenseAccountCode||'613505', debit: amount, credit: 0 } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: item.inventoryAccountCode||'143505', debit: 0, credit: amount } });
      return { mv, parts, amount, jeId: je.id, avgCost };
    }

  // Do 300 G
  const r300 = await doSale(300, 'G');
  console.log('\nSale 300 G -> move', r300.mv.id, 'avgCost', r300.avgCost, 'amount', r300.amount, 'je', r300.jeId);

  // Now do 0.3 KG
  const r03kg = await doSale(0.3, 'KG');
  console.log('\nSale 0.3 KG -> move', r03kg.mv.id, 'avgCost', r03kg.avgCost, 'amount', r03kg.amount, 'je', r03kg.jeId);

    // Show remaining layers
    const finalLayers = await prisma.stockLayer.findMany({ where: { itemId: item.id }, orderBy: { id: 'asc' } });
    console.log('\nFinal layers:');
    for (const l of finalLayers) console.log(' layer', l.id, 'rem=', l.remainingQty.toString(), 'unitCost=', l.unitCost.toString());

    // Cleanup: leave the temporary move/layer (we can optionally delete them)

    return;
  } catch (e) { console.error(e); }
  finally { await prisma.$disconnect(); }
})();