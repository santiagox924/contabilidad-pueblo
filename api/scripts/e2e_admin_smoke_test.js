const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100}

(async function main(){
  try{
    await prisma.$connect();
    console.log('\n=== E2E ADMIN SMOKE TEST START ===\n');

    // 1) Create two items: Rice (kg) and Rice (g)
  // upsert items so script is idempotent
  const riceKg = await prisma.item.upsert({ where: { sku: 'SMOKE-RICE-KG' }, update: {}, create: { sku: 'SMOKE-RICE-KG', name: 'Arroz KG (smoke)', type: 'PRODUCT', unit: 'KG', unitKind: 'WEIGHT', baseUnit: 'KG', displayUnit: 'KG', incomeAccountCode: '413505', taxAccountCode: '240805' } });
  const riceG = await prisma.item.upsert({ where: { sku: 'SMOKE-RICE-G' }, update: {}, create: { sku: 'SMOKE-RICE-G', name: 'Arroz G (smoke)', type: 'PRODUCT', unit: 'G', unitKind: 'WEIGHT', baseUnit: 'G', displayUnit: 'G', incomeAccountCode: '413505', taxAccountCode: '240805' } });
    console.log('Created items', riceKg.id, riceG.id);

    // 2) Create a recipe: 1 KG produces 1000 G (compose G from KG) - for the test we'll make a recipe for a derived SKU
    const parent = await prisma.item.upsert({ where: { sku: 'SMOKE-RICE-PACK' }, update: {}, create: { sku: 'SMOKE-RICE-PACK', name: 'Arroz Pack (from kg+g)', type: 'PRODUCT', unit: 'UN', unitKind: 'COUNT', baseUnit: 'UN', displayUnit: 'UN', incomeAccountCode: '413505', taxAccountCode: '240805' } });
    // Create or update Recipe and components using upsert-like logic
    let recipe = await prisma.recipe.findUnique({ where: { outputItemId: parent.id }, include: { components: true } });
    if(!recipe){
      recipe = await prisma.recipe.create({ data: { outputItemId: parent.id, outputQtyBase: 1, outputUom: 'UN', components: { create: [ { componentId: riceKg.id, qtyBasePerOut: 1, componentUom: 'KG' }, { componentId: riceG.id, qtyBasePerOut: 500, componentUom: 'G' } ] } }, include: { components: true } });
    }
    console.log('Created parent item and recipe', parent.id, recipe.id);

    // 3) Simulate purchase: create purchase stock moves (layers) for rice in KG and G
  // Find existing layers with qty > 0 or create fresh ones
  let layerKg = await prisma.stockLayer.findFirst({ where: { itemId: riceKg.id, warehouseId: 1, remainingQty: { gt: 0 } }, orderBy: { id: 'desc' } });
  if(!layerKg) layerKg = await prisma.stockLayer.create({ data: { itemId: riceKg.id, warehouseId: 1, remainingQty: 10, unitCost: 2000, moveInId: null } }); // 10 KG at 2000 per KG
  let layerG = await prisma.stockLayer.findFirst({ where: { itemId: riceG.id, warehouseId: 1, remainingQty: { gt: 0 } }, orderBy: { id: 'desc' } });
  if(!layerG) layerG = await prisma.stockLayer.create({ data: { itemId: riceG.id, warehouseId: 1, remainingQty: 2000, unitCost: 2, moveInId: null } }); // 2000 G at 2 per G
    console.log('Created layers', layerKg.id, layerG.id);

    // Create JEs for purchases
  const tsBase = Math.floor(Date.now()/1000);
  const je1 = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'TEST_PURCHASE', sourceId: tsBase, description: 'Purchase KG layer', status: 'POSTED' } });
    await prisma.journalLine.createMany({ data: [ { entryId: je1.id, accountCode: '143505', debit: r2(10 * 2000), credit: 0 }, { entryId: je1.id, accountCode: '213505', debit: 0, credit: r2(10 * 2000) } ] });
  const je2 = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'TEST_PURCHASE', sourceId: tsBase + 1, description: 'Purchase G layer', status: 'POSTED' } });
    await prisma.journalLine.createMany({ data: [ { entryId: je2.id, accountCode: '143505', debit: r2(2000 * 2), credit: 0 }, { entryId: je2.id, accountCode: '213505', debit: 0, credit: r2(2000 * 2) } ] });
    console.log('Created purchase JEs', je1.id, je2.id);

    // 4) Create a sale that sells 2 KG of rice (should consume KG layers)
    const saleSm = await prisma.stockMove.create({ data: { itemId: riceKg.id, warehouseId: 1, type: 'SALE', qty: -2, uom: 'KG', unitCost: layerKg.unitCost, refType: 'AUTO_SMOKE_SALE', note: 'Selling 2 KG rice' } });
    // consume from layerKg
    await prisma.stockConsumption.create({ data: { moveOutId: saleSm.id, layerId: layerKg.id, itemId: riceKg.id, warehouseId: 1, qty: 2, unitCost: layerKg.unitCost } });
    await prisma.stockLayer.update({ where: { id: layerKg.id }, data: { remainingQty: { decrement: 2 } } });
  const saleJe = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: saleSm.id, description: 'Auto sale 2KG', status: 'POSTED' } });
    const saleAmount = r2(2 * Number(layerKg.unitCost));
    await prisma.journalLine.createMany({ data: [ { entryId: saleJe.id, accountCode: '110505', debit: saleAmount, credit: 0 }, { entryId: saleJe.id, accountCode: '413505', debit: 0, credit: r2(saleAmount * 0.9) }, { entryId: saleJe.id, accountCode: '240805', debit: 0, credit: r2(saleAmount * 0.1) } ] });
    console.log('Created sale', saleSm.id, 'JE', saleJe.id);

    // 5) Create a sale that sells 1500 G of rice (should use G layers and possibly convert from KG if needed)
    const saleGQty = 1500; // grams
    // Try consume existing G layer first
    let remainingToConsume = saleGQty;
    const layersG = await prisma.stockLayer.findMany({ where: { itemId: riceG.id, warehouseId: 1, remainingQty: { gt: 0 } }, orderBy: { id: 'asc' } });
    for(const l of layersG){
      if(remainingToConsume <= 0) break;
      const take = Math.min(Number(l.remainingQty), remainingToConsume);
      const mvG = await prisma.stockMove.create({ data: { itemId: riceG.id, warehouseId: 1, type: 'SALE', qty: -take, uom: 'G', unitCost: l.unitCost, refType: 'AUTO_SMOKE_SALE', note: `Selling ${take} G rice from layer ${l.id}` } });
      await prisma.stockConsumption.create({ data: { moveOutId: mvG.id, layerId: l.id, itemId: riceG.id, warehouseId: 1, qty: take, unitCost: l.unitCost } });
      await prisma.stockLayer.update({ where: { id: l.id }, data: { remainingQty: { decrement: take } } });
      remainingToConsume -= take;
  const jeG = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mvG.id, description: `Sale G ${mvG.id}`, status: 'POSTED' } });
      const amt = r2(take * Number(l.unitCost));
      await prisma.journalLine.createMany({ data: [ { entryId: jeG.id, accountCode: '110505', debit: amt, credit: 0 }, { entryId: jeG.id, accountCode: '413505', debit: 0, credit: r2(amt * 0.9) }, { entryId: jeG.id, accountCode: '240805', debit: 0, credit: r2(amt * 0.1) } ] });
    }
    // If still remaining, convert from KG layer: 1 KG -> 1000 G
    if(remainingToConsume > 0){
      const kgLayers = await prisma.stockLayer.findMany({ where: { itemId: riceKg.id, warehouseId: 1, remainingQty: { gt: 0 } }, orderBy: { id: 'asc' } });
      for(const kl of kgLayers){
        if(remainingToConsume <= 0) break;
        const availableG = Number(kl.remainingQty) * 1000;
        const takeG = Math.min(availableG, remainingToConsume);
        const takeKg = Math.ceil(takeG / 1000 * 1000) / 1000; // round up small fraction to kg precision
        // create a conversion stockMove out from KG and in to G (simplified)
        const mvOut = await prisma.stockMove.create({ data: { itemId: kl.itemId, warehouseId: 1, type: 'CONVERSION', qty: -takeKg, uom: 'KG', unitCost: kl.unitCost, refType: 'AUTO_CONV', note: `Convert ${takeKg} KG to G for sale` } });
        // decrement kg layer
        await prisma.stockLayer.update({ where: { id: kl.id }, data: { remainingQty: { decrement: takeKg } } });
        // add equivalent g layer
        const newGLayer = await prisma.stockLayer.create({ data: { itemId: riceG.id, warehouseId: 1, remainingQty: takeG, unitCost: r2(kl.unitCost / 1000), moveInId: mvOut.id } });
        // then consume from that new g layer
        const mvG2 = await prisma.stockMove.create({ data: { itemId: riceG.id, warehouseId: 1, type: 'SALE', qty: -Math.min(takeG, remainingToConsume), uom: 'G', unitCost: newGLayer.unitCost, refType: 'AUTO_SMOKE_SALE', note: `Selling converted ${Math.min(takeG, remainingToConsume)} G` } });
        await prisma.stockConsumption.create({ data: { moveOutId: mvG2.id, layerId: newGLayer.id, itemId: riceG.id, warehouseId: 1, qty: Math.min(takeG, remainingToConsume), unitCost: newGLayer.unitCost } });
        await prisma.stockLayer.update({ where: { id: newGLayer.id }, data: { remainingQty: { decrement: Math.min(takeG, remainingToConsume) } } });
  const jeConv = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mvOut.id, description: `Conv JE ${mvOut.id}`, status: 'POSTED' } });
        const convAmt = r2(takeKg * Number(kl.unitCost));
        await prisma.journalLine.createMany({ data: [ { entryId: jeConv.id, accountCode: '143505', debit: 0, credit: convAmt }, { entryId: jeConv.id, accountCode: '613505', debit: convAmt, credit: 0 } ] });
        remainingToConsume -= takeG;
      }
    }
    console.log('Finished G sale attempt, remainingToConsume:', remainingToConsume);

    // 6) Create a recipe-based sale: create a sale for parent item which should consume recipe components
    // For test simplicity: when selling 1 parent UN, consume 1 KG and 500 G
    const saleParent = await prisma.stockMove.create({ data: { itemId: parent.id, warehouseId: 1, type: 'SALE', qty: -1, uom: 'UN', unitCost: 0, refType: 'AUTO_SMOKE_SALE', note: 'Selling 1 parent pack' } });
    // consume 1 KG
    await prisma.stockConsumption.create({ data: { moveOutId: saleParent.id, layerId: layerKg.id, itemId: riceKg.id, warehouseId: 1, qty: 1, unitCost: layerKg.unitCost } });
    await prisma.stockLayer.update({ where: { id: layerKg.id }, data: { remainingQty: { decrement: 1 } } });
    // consume 500 G
    // try to find an existing G layer (after previous sales)
    const gLayerAfter = await prisma.stockLayer.findFirst({ where: { itemId: riceG.id, warehouseId: 1, remainingQty: { gt: 0 } } });
    if(gLayerAfter){
      await prisma.stockConsumption.create({ data: { moveOutId: saleParent.id, layerId: gLayerAfter.id, itemId: riceG.id, warehouseId: 1, qty: 500, unitCost: gLayerAfter.unitCost } });
      await prisma.stockLayer.update({ where: { id: gLayerAfter.id }, data: { remainingQty: { decrement: 500 } } });
    }
  const jeParent = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'SALES_INVOICE', sourceId: 999999, description: 'Sale parent pack', status: 'POSTED' } });
    await prisma.journalLine.createMany({ data: [ { entryId: jeParent.id, accountCode: '110505', debit: 10000, credit: 0 }, { entryId: jeParent.id, accountCode: '413505', debit: 0, credit: 9000 }, { entryId: jeParent.id, accountCode: '240805', debit: 0, credit: 1000 } ] });
    console.log('Created parent sale and consumption', saleParent.id, jeParent.id);

    // 7) Print current layers and last journal lines for verification
    const layers = await prisma.stockLayer.findMany({ where: { warehouseId: 1 }, orderBy: { id: 'asc' } });
    console.log('\n--- Stock Layers (warehouse 1) ---');
    for(const L of layers) console.log(L.id, L.itemId, L.remainingQty, L.unitCost, 'moveIn', L.moveInId);

    const recentJEs = await prisma.journalEntry.findMany({ where: { date: { gte: new Date(Date.now() - 1000*60*60) } }, orderBy: { id: 'asc' }, include: { lines: true } });
    console.log('\n--- Recent Journal Entries ---');
    for(const je of recentJEs) { console.log('JE', je.id, je.description); for(const l of je.lines) console.log('  ', l.accountCode, 'D', l.debit, 'C', l.credit); }

    console.log('\n=== E2E ADMIN SMOKE TEST END ===\n');
  }catch(e){ console.error('ERR', e); }
  finally{ await prisma.$disconnect(); }
})();
