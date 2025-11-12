const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100}

(async()=>{
  try{
    await prisma.$connect();
    const moves = [161,162,163,164];
    const warehouseId = 1;
    const results = [];
    for(const moveId of moves){
      const sm = await prisma.stockMove.findUnique({ where: { id: moveId } });
      if(!sm) { console.log('No stockMove', moveId); continue; }
      // crear layer vinculado
      const layer = await prisma.stockLayer.create({ data: { itemId: sm.itemId, warehouseId, remainingQty: sm.qty, unitCost: sm.unitCost, moveInId: sm.id } });
      console.log('Created layer', layer.id, 'for move', moveId);

      // ahora simulamos una venta que consuma toda la capa
      const qtyToSell = Number(layer.remainingQty);
      if(qtyToSell <= 0){ console.log('nothing to sell in layer', layer.id); continue; }
      // create sale stockMove (negative qty)
      const mvOut = await prisma.stockMove.create({ data: { itemId: sm.itemId, warehouseId, type: 'SALE', qty: -qtyToSell, uom: 'UN', unitCost: layer.unitCost, refType: 'AUTO_TEST_SALE', refId: null, note: `Auto sale for layer ${layer.id}` } });
      // create consumption
      await prisma.stockConsumption.create({ data: { moveOutId: mvOut.id, layerId: layer.id, itemId: layer.itemId, warehouseId, qty: qtyToSell, unitCost: layer.unitCost } });
      // decrement layer
      await prisma.stockLayer.update({ where: { id: layer.id }, data: { remainingQty: { decrement: qtyToSell } } });

      // create JE for sale: debit COGS (613505) credit Inventory (143505)
      const amount = r2(qtyToSell * Number(layer.unitCost));
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mvOut.id, description: `Auto sale move ${mvOut.id} consuming layer ${layer.id}`, status: 'POSTED' } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '613505', debit: amount, credit: 0 } });
      await prisma.journalLine.create({ data: { entryId: je.id, accountCode: '143505', debit: 0, credit: amount } });

      results.push({ layerId: layer.id, mvOutId: mvOut.id, saleJeId: je.id, amount });
      console.log('Sold', qtyToSell, 'item', sm.itemId, 'mvOut', mvOut.id, 'je', je.id, 'amount', amount);
    }
    console.log('Done results:', results);
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
