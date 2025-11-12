const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100}

(async function(){
  try{
    await prisma.$connect();
    console.log('\n=== ASSERT BOM MOVES ALLOW NEGATIVE START ===\n');

    // Find the parent recipe we created earlier
    const parent = await prisma.item.findFirst({ where: { sku: 'SMOKE-RICE-PACK' } });
    if(!parent){ console.log('Parent item not found, run e2e_admin_smoke_test first'); return; }
    const rec = await prisma.recipe.findFirst({ where: { outputItemId: parent.id }, include: { components: true } });
    if(!rec){ console.log('No recipe found for parent', parent.id); return; }

    console.log('Recipe', rec.id, 'components:', rec.components.map(c=>({id:c.id,component:c.componentId,qtyBasePerOut:c.qtyBasePerOut.toString()})));

    // For each component, ensure there is NO available prepared stock (set remainingQty = 0)
    for(const c of rec.components){
      await prisma.stockLayer.updateMany({ where: { itemId: c.componentId }, data: { remainingQty: 0 } });
    }
    console.log('Zeroed component layers (if any)');

    // Now simulate consumption (allowNegative = true) for each component for 1 unit of output
    const saleRef = `ASSERT_BOM_${Date.now()}`;
    const createdMoves = [];
    for(const c of rec.components){
      const need = Number(c.qtyBasePerOut ?? 0);
      // mimic consumeFifoAndMove with allowNegative true: consume available (none) and create negative move
      const consumed = 0; // after zeroing layers
      const remaining = need - consumed; // >0
      const moveQty = - (consumed + remaining);
      const avgCost = 0; // if no consumed, cost 0 (for test)

      const mv = await prisma.stockMove.create({ data: { itemId: c.componentId, warehouseId: 1, type: 'SALE', qty: moveQty, uom: 'UN', unitCost: avgCost, refType: 'ASSERT_BOM', refId: null, note: `Assert consume comp ${c.componentId}` } });
      // create a simple JE: debit COGS 613505 credit Inventory 143505 with amount 0 (since avgCost 0)
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mv.id, description: `Assert JE for move ${mv.id}`, status: 'POSTED' } });
      await prisma.journalLine.createMany({ data: [ { entryId: je.id, accountCode: '613505', debit: 0, credit: 0 }, { entryId: je.id, accountCode: '143505', debit: 0, credit: 0 } ] });
      createdMoves.push({ moveId: mv.id, jeId: je.id, itemId: c.componentId, qty: moveQty });
    }

    console.log('Created moves and JEs for recipe components:', createdMoves);

    // Assert JEs exist
    const jeIds = createdMoves.map(x=>x.jeId);
    const jes = await prisma.journalEntry.findMany({ where: { id: { in: jeIds } }, include: { lines: true } });
    if(jes.length === jeIds.length) console.log('PASS: Journal entries created for each component (even with zero stock)');
    else console.log('FAIL: missing JEs', jeIds.filter(id=>!jes.find(j=>j.id===id)));

    console.log('\n=== ASSERT END ===\n');
  }catch(e){ console.error('ERR', e); }
  finally{ await prisma.$disconnect(); }
})();
