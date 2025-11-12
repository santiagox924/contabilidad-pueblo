const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = {
  UN:1, DZ:12, PKG:1, BOX:1, PR:2, ROLL:1,
  MG:0.001, G:1, KG:1000, LB:453.59237,
  ML:1, L:1000, M3:1000000, CM3:1, OZ_FL:29.5735295625, GAL:3785.411784,
  MM:1, CM:10, M:1000, KM:1000000, IN:25.4, FT:304.8, YD:914.4,
  CM2:1, M2:10000, IN2:6.4516, FT2:929.0304, YD2:8361.2736
};
function convertToBase(qty, from, base) { if (!from||!base) return qty; if (from===base) return qty; const inBase = qty*(TO_BASE[from]??1); const factor = 1/(TO_BASE[base]??1); return inBase*factor; }
function r2(n){ return Math.round((Number(n)+Number.EPSILON)*100)/100 }

const cases = [
  { family: 'WEIGHT', base: 'G', pairs: [['KG','G'], ['G','KG'], ['KG','MG'], ['MG','KG']] },
  { family: 'VOLUME', base: 'ML', pairs: [['L','ML'], ['ML','L']] },
  { family: 'LENGTH', base: 'MM', pairs: [['M','MM'], ['MM','M']] },
  { family: 'AREA', base: 'CM2', pairs: [['M2','CM2'], ['CM2','M2']] },
  { family: 'COUNT', base: 'UN', pairs: [['DZ','UN'], ['UN','DZ']] }
];

async function run() {
  const whId = 1;
  const ts = Date.now();
  const results = [];
  for (const c of cases) {
    for (const [purchaseUom, saleUom] of c.pairs) {
      const sku = `BID-${c.family}-${purchaseUom}-${saleUom}-${ts}`;
      const name = `Bid ${c.family} ${purchaseUom}->${saleUom}`;
      const it = await prisma.item.create({ data: { sku, name, type: 'PRODUCT', unitKind: c.family, baseUnit: c.base, displayUnit: purchaseUom, price: 0, inventoryAccountCode: '143505', expenseAccountCode: '613505' } });
      // Define purchase qty and unit cost so base unit cost is simple
      // pick purchaseQty = 1 in purchaseUom, purchaseUnitCost = 1000 (makes calculations easy)
      const purchaseQty = 1;
      const purchaseUnitCost = 1000;
      const qtyBase = convertToBase(purchaseQty, purchaseUom, c.base);
      const factor = convertToBase(1, purchaseUom, c.base);
      const unitCostBase = factor > 0 ? purchaseUnitCost / factor : purchaseUnitCost;
      // create move and layer
      const move = await prisma.stockMove.create({ data: { itemId: it.id, warehouseId: whId, type: 'PURCHASE', qty: qtyBase, uom: c.base, unitCost: unitCostBase, note: 'bidirectional test purchase' } });
      const layer = await prisma.stockLayer.create({ data: { itemId: it.id, warehouseId: whId, remainingQty: qtyBase, unitCost: unitCostBase, moveInId: move.id } });

      // choose sale qty: if saleUom is larger than purchaseUom, pick saleQty = 0.5 of saleUom (fractional), else if smaller pick saleQty = some smaller number
      // compute a saleQty such that saleQtyBase <= qtyBase
      // start with saleQty =  (purchaseQty * (purchaseUom in base)) / (saleUom in base) * 0.5 to sell half
      const saleQtyBasePossible = qtyBase;
      const saleUnitToBase = convertToBase(1, saleUom, c.base);
      const saleQty = (saleQtyBasePossible / saleUnitToBase) * 0.5; // sell half of stock expressed in saleUom

      // perform sale
      const saleQtyBase = convertToBase(saleQty, saleUom, c.base);
      // consume
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
        results.push({ family: c.family, purchaseUom, saleUom, ok: false, reason: 'insufficient stock' });
        continue;
      }
      const weighted = parts.reduce((s,p)=>s + p.qty * p.unitCost, 0);
      const consumed = parts.reduce((s,p)=>s + p.qty, 0);
      const avgCost = consumed>0? r2(weighted/consumed) : 0;
      const saleMove = await prisma.stockMove.create({ data: { itemId: it.id, warehouseId: whId, type: 'SALE', qty: -consumed, uom: c.base, unitCost: avgCost, note: `bid sale ${saleQty}${saleUom}` } });
      for (const p of parts) {
        await prisma.stockConsumption.create({ data: { moveOutId: saleMove.id, layerId: p.layerId, itemId: it.id, warehouseId: whId, qty: p.qty, unitCost: p.unitCost } });
        await prisma.stockLayer.update({ where: { id: p.layerId }, data: { remainingQty: { decrement: p.qty } } });
      }
      const amount = r2(Math.abs(saleMove.qty * Number(saleMove.unitCost)));
      const expected = r2(saleQtyBase * unitCostBase);
      const ok = amount === expected;
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: saleMove.id, description: `bid ${c.family} ${purchaseUom}->${saleUom}` } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '613505', debit: amount, credit: 0 } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '143505', debit: 0, credit: amount } });

      results.push({ family: c.family, purchaseUom, saleUom, ok, amount, expected, saleMoveId: saleMove.id, jeId: je.id });
    }
  }
  console.log('Bidirectional E2E results:');
  for (const r of results) console.log(r);
  await prisma.$disconnect();
}

run().catch(e=>{ console.error(e); prisma.$disconnect(); });
