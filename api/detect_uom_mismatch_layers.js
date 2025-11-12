const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = {
  // COUNT defaults
  UN: 1, DZ: 12, PKG: 1, BOX: 1, PR: 2, ROLL: 1,
  // WEIGHT
  MG: 0.001, G:1, KG:1000, LB:453.59237,
  // VOLUME
  ML:1, L:1000, M3:1000000, CM3:1, OZ_FL:29.5735295625, GAL:3785.411784,
  // LENGTH
  MM:1, CM:10, M:1000, KM:1000000, IN:25.4, FT:304.8, YD:914.4,
  // AREA
  CM2:1, M2:10000, IN2:6.4516, FT2:929.0304, YD2:8361.2736
}
function convertToBase(qty, from, base) {
  if (!from || !base) return qty;
  if (from === base) return qty;
  const famWeight = ['MG','G','KG','LB'];
  const famVol = ['ML','L','M3','CM3','OZ_FL','GAL'];
  const famLen = ['MM','CM','M','KM','IN','FT','YD'];
  const famArea = ['CM2','M2','IN2','FT2','YD2'];
  if ((famWeight.includes(from) && famWeight.includes(base)) ||
      (famVol.includes(from) && famVol.includes(base)) ||
      (famLen.includes(from) && famLen.includes(base)) ||
      (famArea.includes(from) && famArea.includes(base)) ||
      from===base) {
    const inBase = qty * (TO_BASE[from] ?? 1);
    const factor = 1 / (TO_BASE[base] ?? 1);
    return inBase * factor;
  }
  throw new Error('Incompatible units ' + from + ' vs ' + base);
}
function r2(n){ return Math.round((Number(n) + Number.EPSILON)*100)/100 }
(async()=>{
  try {
    const layers = await prisma.stockLayer.findMany({ include: { moveIn: true, item: true } });
    const affected = [];
    for (const l of layers) {
      const move = l.moveIn;
      if (!move) continue;
      const itemBase = l.item.baseUnit;
      if (move.uom === itemBase) continue;
      // compute expected unitCost per base
      const raw = Number(move.unitCost ?? 0);
      const factor = convertToBase(1, move.uom, itemBase);
      const expectedUnitCostBase = factor > 0 ? raw / factor : raw;
      const remaining = Number(l.remainingQty ?? 0);
      const oldValue = r2(remaining * raw);
      const newValue = r2(remaining * expectedUnitCostBase);
      const delta = r2(newValue - oldValue);
      affected.push({
        itemId: l.itemId,
        itemName: l.item.name,
        layerId: l.id,
        moveId: move.id,
        moveUom: move.uom,
        itemBase,
        remainingQty: remaining,
        oldUnitCost: raw,
        newUnitCost: r2(expectedUnitCostBase),
        oldValue,
        newValue,
        delta
      });
    }

    const grouped = {};
    let totalDelta = 0;
    for (const a of affected) {
      totalDelta += a.delta;
      grouped[a.itemId] = grouped[a.itemId] || { itemName: a.itemName, lines: [], subtotal: 0 };
      grouped[a.itemId].lines.push(a);
      grouped[a.itemId].subtotal += a.delta;
    }

    console.log('Found', affected.length, 'affected layers. total delta=', r2(totalDelta));
    for (const k of Object.keys(grouped)) {
      console.log('\nItem', k, grouped[k].itemName, 'subtotal delta=', r2(grouped[k].subtotal));
      for (const row of grouped[k].lines) {
        console.log(' layer', row.layerId, 'move', row.moveId, 'moveUom', row.moveUom, 'remQty', row.remainingQty, 'oldUnitCost', row.oldUnitCost, 'newUnitCost', row.newUnitCost, 'delta', row.delta);
      }
    }

    // write json
    const fs = require('fs');
    fs.writeFileSync('uom_layers_report.json', JSON.stringify({ totalDelta: r2(totalDelta), affected, grouped }, null, 2));
    console.log('\nWrote uom_layers_report.json');
  } catch(e){ console.error(e); }
  finally { await prisma.$disconnect(); }
})();