const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = {
  // COUNT
  UN:1, DZ:12, PKG:1, BOX:1, PR:2, ROLL:1,
  // WEIGHT
  MG:0.001, G:1, KG:1000, LB:453.59237,
  // VOLUME
  ML:1, L:1000, M3:1000000, CM3:1, OZ_FL:29.5735295625, GAL:3785.411784,
  // LENGTH
  MM:1, CM:10, M:1000, KM:1000000, IN:25.4, FT:304.8, YD:914.4,
  // AREA
  CM2:1, M2:10000, IN2:6.4516, FT2:929.0304, YD2:8361.2736
};
function convertToBase(qty, from, base) {
  if (!from || !base) return qty;
  if (from === base) return qty;
  const inBase = qty * (TO_BASE[from] ?? 1);
  const factor = 1 / (TO_BASE[base] ?? 1);
  return inBase * factor;
}
function r2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100 }

async function run() {
  const whId = 1;
  const ts = Date.now();
  const cases = [
    {
      family: 'COUNT', base: 'UN', purchaseUom: 'DZ', purchaseQty: 2, purchaseUnitCost: 120, // 120 per DZ => 10 per UN
      saleUom: 'UN', saleQty: 3, expected: null
    },
    {
      family: 'WEIGHT', base: 'G', purchaseUom: 'KG', purchaseQty: 1, purchaseUnitCost: 1500, // 1 KG @1500 => 1.5 per G
      saleUom: 'G', saleQty: 300, expected: null
    },
    {
      family: 'VOLUME', base: 'ML', purchaseUom: 'L', purchaseQty: 1, purchaseUnitCost: 1000, // 1 L @1000 => 1 per ML
      saleUom: 'ML', saleQty: 500, expected: null
    },
    {
      family: 'LENGTH', base: 'MM', purchaseUom: 'M', purchaseQty: 1, purchaseUnitCost: 2000, // 1 M @2000 => 2 per MM
      saleUom: 'MM', saleQty: 500, expected: null
    },
    {
      family: 'AREA', base: 'CM2', purchaseUom: 'M2', purchaseQty: 1, purchaseUnitCost: 10000, // 1 m2 @10000 => 1 per cm2
      saleUom: 'CM2', saleQty: 250, expected: null
    }
  ];

  const results = [];
  for (const c of cases) {
    // create item
    const sku = `TEST-${c.family}-${ts}`;
    const name = `Test ${c.family}`;
    const it = await prisma.item.create({ data: { sku, name, type: 'PRODUCT', unitKind: c.family === 'COUNT' ? 'COUNT' : (c.family==='WEIGHT'?'WEIGHT':(c.family==='VOLUME'?'VOLUME':(c.family==='LENGTH'?'LENGTH':'AREA'))), baseUnit: c.base, displayUnit: c.purchaseUom, price: 0, inventoryAccountCode: '143505', expenseAccountCode: '613505' } });

    // compute base qty and unitCostBase
    const qtyBase = convertToBase(c.purchaseQty, c.purchaseUom, c.base);
    const factor = convertToBase(1, c.purchaseUom, c.base);
    const unitCostBase = factor > 0 ? Number(c.purchaseUnitCost) / factor : c.purchaseUnitCost;

    // create move & layer (normalized in base unit)
    const move = await prisma.stockMove.create({ data: { itemId: it.id, warehouseId: whId, type: 'PURCHASE', qty: qtyBase, uom: c.base, unitCost: unitCostBase, note: `Initial purchase ${c.family}` } });
    const layer = await prisma.stockLayer.create({ data: { itemId: it.id, warehouseId: whId, remainingQty: qtyBase, unitCost: unitCostBase, moveInId: move.id } });

    // perform sale
    const saleQtyBase = convertToBase(c.saleQty, c.saleUom, c.base);
    // consume FEFO
    const layers = await prisma.stockLayer.findMany({ where: { itemId: it.id, warehouseId: whId, remainingQty: { gt: 0 } }, orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }] });
    let remaining = saleQtyBase; const parts = [];
    for (const l of layers) {
      if (remaining <= 0) break;
      const avail = Number(l.remainingQty);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      parts.push({ layerId: l.id, qty: take, unitCost: Number(l.unitCost) });
      remaining = r2(remaining - take);
    }
    if (remaining > 0) {
      results.push({ family: c.family, ok: false, reason: 'insufficient stock' });
      continue;
    }
    const weighted = parts.reduce((s,p)=>s + p.qty * p.unitCost, 0);
    const consumed = parts.reduce((s,p)=>s + p.qty, 0);
    const avgCost = consumed>0? r2(weighted/consumed) : 0;

    const saleMove = await prisma.stockMove.create({ data: { itemId: it.id, warehouseId: whId, type: 'SALE', qty: -consumed, uom: c.base, unitCost: avgCost, note: `Test sale ${c.saleQty}${c.saleUom}` } });
    for (const p of parts) {
      await prisma.stockConsumption.create({ data: { moveOutId: saleMove.id, layerId: p.layerId, itemId: it.id, warehouseId: whId, qty: p.qty, unitCost: p.unitCost } });
      await prisma.stockLayer.update({ where: { id: p.layerId }, data: { remainingQty: { decrement: p.qty } } });
    }
    const amount = Math.abs(Number(saleMove.qty) * Number(saleMove.unitCost));
    const expected = r2(saleQtyBase * unitCostBase);
    const ok = r2(amount) === r2(expected);
    // create JE
    const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: saleMove.id, description: `E2E ${c.family}` } });
    await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '613505', debit: amount, credit: 0 } });
    await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '143505', debit: 0, credit: amount } });

    results.push({ family: c.family, ok, amount, expected, saleMoveId: saleMove.id, jeId: je.id });
  }

  console.log('E2E family conversion results:');
  for (const r of results) console.log(r);
  await prisma.$disconnect();
}

run().catch(e=>{ console.error(e); prisma.$disconnect(); });