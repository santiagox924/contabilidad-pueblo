const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function r2(n){ return Math.round((n + Number.EPSILON) * 100) / 100 }

(async()=>{
  try{
    await prisma.$connect();
    // simplified version of the test: create items, purchases, stock moves/layers, sales, then print results
    const pmCash = await prisma.paymentMethod.create({ data: { name: `PM-CASH-${Date.now()}`, cashAccountCode: '110505' } });
    const pmBank = await prisma.paymentMethod.create({ data: { name: `PM-BANK-${Date.now()}`, bankAccountCode: '11100501' } });
    console.log('Created pms', pmCash.id, pmBank.id);

    const itemA = await prisma.item.create({ data: { sku: `TEST-A-${Date.now()}`, name: 'Test Item A', type: 'PRODUCT', baseUnit: 'UN', ivaPct: 19 } });
    const itemB = await prisma.item.create({ data: { sku: `TEST-B-${Date.now()}`, name: 'Test Item B', type: 'PRODUCT', baseUnit: 'UN', ivaPct: 5 } });
    console.log('Created items', itemA.id, itemB.id);

    // ensure supplier
    let supplier = await prisma.thirdParty.findFirst({ where: { roles: { has: 'PROVIDER' } } });
    if (!supplier) supplier = await prisma.thirdParty.create({ data: { type: 'PROVIDER', name: 'TP test A', document: '900000002', roles: ['PROVIDER'] } });

    // purchase A cash
    const subtotalA = 1000; const taxA = r2(subtotalA * 19 / 100); const totalA = r2(subtotalA + taxA);
    const piA = await prisma.purchaseInvoice.create({ data: { number: 9101, thirdPartyId: supplier.id, issueDate: new Date(), paymentType: 'CASH', subtotal: subtotalA, tax: taxA, total: totalA, status: 'ISSUED', lines: { create: [{ itemId: itemA.id, qty: 1, unitCost: subtotalA, vatPct: 19, lineSubtotal: subtotalA, lineVat: taxA, lineTotal: totalA }] } }, include: { lines: true } });
    console.log('Created purchase A', piA.id);
    const smA = await prisma.stockMove.create({ data: { itemId: itemA.id, warehouseId: 1, type: 'PURCHASE', qty: 1, uom: 'UN', unitCost: subtotalA, refType: 'PurchaseInvoice', refId: piA.id } });
    const layerA = await prisma.stockLayer.create({ data: { itemId: itemA.id, warehouseId: 1, remainingQty: 1, unitCost: subtotalA, moveInId: smA.id } });
    const jePA = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'PURCHASE_INVOICE', sourceId: piA.id, description: `PI-A ${piA.number}`, status: 'POSTED' } });
    await prisma.journalLine.createMany({ data: [{ entryId: jePA.id, accountCode: '143505', debit: subtotalA, credit: 0 }, { entryId: jePA.id, accountCode: '135530', debit: taxA, credit: 0 }, { entryId: jePA.id, accountCode: pmCash.cashAccountCode, debit: 0, credit: totalA }] });

    // purchase B credit
    const subtotalB = 2000; const taxB = r2(subtotalB * 5 / 100); const totalB = r2(subtotalB + taxB);
    const piB = await prisma.purchaseInvoice.create({ data: { number: 9102, thirdPartyId: supplier.id, issueDate: new Date(), paymentType: 'CREDIT', subtotal: subtotalB, tax: taxB, total: totalB, status: 'ISSUED', lines: { create: [{ itemId: itemB.id, qty: 1, unitCost: subtotalB, vatPct: 5, lineSubtotal: subtotalB, lineVat: taxB, lineTotal: totalB }] } }, include: { lines: true } });
    const smB = await prisma.stockMove.create({ data: { itemId: itemB.id, warehouseId: 1, type: 'PURCHASE', qty: 1, uom: 'UN', unitCost: subtotalB, refType: 'PurchaseInvoice', refId: piB.id } });
    const layerB = await prisma.stockLayer.create({ data: { itemId: itemB.id, warehouseId: 1, remainingQty: 1, unitCost: subtotalB, moveInId: smB.id } });
    const jePB = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'PURCHASE_INVOICE', sourceId: piB.id, description: `PI-B ${piB.number}`, status: 'POSTED' } });
    await prisma.journalLine.createMany({ data: [{ entryId: jePB.id, accountCode: '143505', debit: subtotalB, credit: 0 }, { entryId: jePB.id, accountCode: '135530', debit: taxB, credit: 0 }, { entryId: jePB.id, accountCode: '220505', debit: 0, credit: totalB }] });

    // sales
    const mvOutA = await prisma.stockMove.create({ data: { itemId: itemA.id, warehouseId: 1, type: 'SALE', qty: -1, uom: 'UN', unitCost: layerA.unitCost } });
    await prisma.stockConsumption.create({ data: { moveOutId: mvOutA.id, layerId: layerA.id, itemId: itemA.id, warehouseId: 1, qty: 1, unitCost: layerA.unitCost } });
    await prisma.stockLayer.update({ where: { id: layerA.id }, data: { remainingQty: { decrement: 1 } } });
    const jeSaleA = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mvOutA.id, description: `Sale A mv ${mvOutA.id}` } });
    await prisma.journalLine.createMany({ data: [{ entryId: jeSaleA.id, accountCode: '613505', debit: layerA.unitCost, credit: 0 }, { entryId: jeSaleA.id, accountCode: '143505', debit: 0, credit: layerA.unitCost }] });

    const mvOutB = await prisma.stockMove.create({ data: { itemId: itemB.id, warehouseId: 1, type: 'SALE', qty: -1, uom: 'UN', unitCost: layerB.unitCost } });
    await prisma.stockConsumption.create({ data: { moveOutId: mvOutB.id, layerId: layerB.id, itemId: itemB.id, warehouseId: 1, qty: 1, unitCost: layerB.unitCost } });
    await prisma.stockLayer.update({ where: { id: layerB.id }, data: { remainingQty: { decrement: 1 } } });
    const jeSaleB = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'STOCK_MOVE', sourceId: mvOutB.id, description: `Sale B mv ${mvOutB.id}` } });
    await prisma.journalLine.createMany({ data: [{ entryId: jeSaleB.id, accountCode: '613505', debit: layerB.unitCost, credit: 0 }, { entryId: jeSaleB.id, accountCode: '143505', debit: 0, credit: layerB.unitCost }] });

    console.log('Done test flow. Purchase A JE:', jePA.id, 'Purchase B JE:', jePB.id, 'Sale A JE:', jeSaleA.id, 'Sale B JE:', jeSaleB.id);

  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
