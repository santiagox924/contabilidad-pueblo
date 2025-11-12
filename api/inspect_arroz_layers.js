const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async ()=>{
  try {
    const name = 'arroz';
    const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
    if (!item) return console.log('No item found', name);
    console.log('Item:', item.id, item.name, 'baseUnit=', item.baseUnit, 'displayUnit=', item.displayUnit);
    const layers = await prisma.stockLayer.findMany({ where: { itemId: item.id }, orderBy: { id: 'asc' } });
    console.log('\nLayers for item', item.id);
    for (const l of layers) {
      console.log('layer id=', l.id, 'warehouse=', l.warehouseId, 'remainingQty=', l.remainingQty.toString(), 'unitCost=', l.unitCost.toString(), 'moveInId=', l.moveInId);
    }

    const consumptions = await prisma.stockConsumption.findMany({ where: { itemId: item.id }, orderBy: { id: 'asc' } });
    console.log('\nStock consumptions:');
    for (const c of consumptions) console.log('cons id=', c.id, 'layerId=', c.layerId, 'moveOutId=', c.moveOutId, 'qty=', c.qty.toString(), 'unitCost=', c.unitCost.toString());
  } catch(e){ console.error(e); } finally { await prisma.$disconnect(); }
})();