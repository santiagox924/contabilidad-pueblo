const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const TO_BASE = {
  UN:1, DZ:12, PKG:1, BOX:1, PR:2, ROLL:1,
  MG:0.001, G:1, KG:1000, LB:453.59237,
  ML:1, L:1000, M3:1000000, CM3:1, OZ_FL:29.5735295625, GAL:3785.411784,
  MM:1, CM:10, M:1000, KM:1000000, IN:25.4, FT:304.8, YD:914.4,
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
(async()=>{
  try {
    // load affected layers with related move and item
    const layers = await prisma.stockLayer.findMany({ where: { moveInId: { not: null } }, include: { moveIn: true, item: true } });
    const affected = layers.filter(l => l.moveIn && l.moveIn.uom !== l.item.baseUnit);
    if (!affected.length) return console.log('No affected layers found');

    // aggregate per item
    const perItem = new Map();
    for (const l of affected) {
      const move = l.moveIn;
      const item = l.item;
      const itemBase = item.baseUnit;
      const rawUnitCost = Number(move.unitCost ?? 0);
      const factor = convertToBase(1, move.uom, itemBase);
      const newUnitCost = factor > 0 ? rawUnitCost / factor : rawUnitCost;
      const remaining = Number(l.remainingQty ?? 0);
      const oldValue = r2(remaining * rawUnitCost);
      const newValue = r2(remaining * newUnitCost);
      const delta = r2(newValue - oldValue);

      if (!perItem.has(item.id)) perItem.set(item.id, { item, rows: [], subtotal: 0 });
      const entry = perItem.get(item.id);
      entry.rows.push({ layerId: l.id, moveId: move.id, moveUom: move.uom, remaining, oldUnitCost: rawUnitCost, newUnitCost: r2(newUnitCost), oldValue, newValue, delta });
      entry.subtotal = r2(entry.subtotal + delta);
    }

    // Start transaction to update DB and create JE
    const timestamp = Date.now();
    const sourceType = 'UOM_NORMALIZATION';
    const sourceId = Math.floor(timestamp/1000);

    // Prepare journal lines aggregation per account code
    const journalLines = [];

    await prisma.$transaction(async (tx) => {
      // For each item, apply updates
      for (const [itemId, data] of perItem.entries()) {
        const item = data.item;
        const inventoryAccount = item.inventoryAccountCode || '143505';
        const cogsAccount = item.expenseAccountCode || '613505';
        const subtotal = data.subtotal; // newValue - oldValue

        // Update layers/moves/consumptions
        for (const r of data.rows) {
          // find move (moveIn may be shared across layers)
          const mv = await tx.stockMove.findUnique({ where: { id: r.moveId } });
          if (!mv) continue;
          const moveUom = mv.uom;
          const factor = convertToBase(1, moveUom, item.baseUnit);
          const raw = Number(mv.unitCost ?? 0);
          const newUnitCost = factor > 0 ? raw / factor : raw;
          // update move unitCost and uom to base
          await tx.stockMove.update({ where: { id: mv.id }, data: { unitCost: newUnitCost, uom: item.baseUnit } });

          // update stockLayer.unitCost where moveInId = mv.id
          await tx.stockLayer.updateMany({ where: { moveInId: mv.id }, data: { unitCost: newUnitCost } });

          // update stockConsumption.unitCost for consumptions referencing those layers
          const layersForMove = await tx.stockLayer.findMany({ where: { moveInId: mv.id }, select: { id: true } });
          const layerIds = layersForMove.map(x=>x.id);
          if (layerIds.length) {
            await tx.stockConsumption.updateMany({ where: { layerId: { in: layerIds } }, data: { unitCost: newUnitCost } });
          }
        }

        // Build journal lines: subtotal positive => debit inventory, credit cogs
        const amt = Math.abs(subtotal);
        if (subtotal === 0) continue;
        if (subtotal > 0) {
          journalLines.push({ accountCode: inventoryAccount, debit: amt, credit: 0, description: `Ajuste UoM item ${item.name}` });
          journalLines.push({ accountCode: cogsAccount, debit: 0, credit: amt, description: `Ajuste UoM item ${item.name}` });
        } else {
          // subtotal < 0: decrease inventory => credit inventory, debit cogs
          journalLines.push({ accountCode: cogsAccount, debit: amt, credit: 0, description: `Ajuste UoM item ${item.name}` });
          journalLines.push({ accountCode: inventoryAccount, debit: 0, credit: amt, description: `Ajuste UoM item ${item.name}` });
        }
      }

      if (journalLines.length === 0) return;

      // aggregate lines by accountCode/debit/credit to reduce duplicates
      const agg = {};
      for (const l of journalLines) {
        const key = `${l.accountCode}-${l.debit}-${l.credit}`;
        if (!agg[key]) agg[key] = { ...l };
        else agg[key].description += `; ${l.description}`;
      }
      const finalLines = Object.values(agg);

      // build JournalEntry and lines
      const entry = await tx.journalEntry.create({ data: { date: new Date(), sourceType, sourceId, description: `Ajuste por normalizacion UoM (${new Date().toISOString()})` } });
      for (const l of finalLines) {
        await tx.journalLine.create({ data: { entryId: entry.id, accountCode: l.accountCode, debit: l.debit, credit: l.credit, description: l.description } });
      }

      console.log('Created JournalEntry id=', entry.id, 'with', finalLines.length, 'lines');

    }); // end transaction

    console.log('Normalization and adjustment complete.');
    console.log('Summary per item:');
    for (const [id, d] of perItem.entries()) {
      console.log('Item', id, d.item.name, 'subtotal delta=', d.subtotal);
      for (const r of d.rows) console.log('  layer', r.layerId, 'move', r.moveId, 'rem', r.remaining, 'oldUnitCost', r.oldUnitCost, 'newUnitCost', r.newUnitCost, 'delta', r.delta);
    }

  } catch (e) { console.error('Error:', e); }
  finally { await prisma.$disconnect(); }
})();