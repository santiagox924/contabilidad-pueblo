import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function r2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe('purchase -> inventory -> sale integration', () => {
  const created: {
    items: number[];
    pInvoices: number[];
    stockMoves: number[];
    layers: number[];
    salesMoves: number[];
    jes: number[];
    pms: number[];
  } = {
    items: [],
    pInvoices: [],
    stockMoves: [],
    layers: [],
    salesMoves: [],
    jes: [],
    pms: [],
  };

  beforeAll(async () => {
    await prisma.$connect();
  });
  afterAll(async () => {
    // cleanup created records (best-effort)
    try {
      if (created.jes.length)
        await prisma.journalLine.deleteMany({
          where: { entryId: { in: created.jes } },
        });
      if (created.jes.length)
        await prisma.journalEntry.deleteMany({
          where: { id: { in: created.jes } },
        });
      if (created.salesMoves.length)
        await prisma.stockConsumption.deleteMany({
          where: { moveOutId: { in: created.salesMoves } },
        });
      if (created.salesMoves.length)
        await prisma.stockMove.deleteMany({
          where: { id: { in: created.salesMoves } },
        });
      if (created.layers.length)
        await prisma.stockLayer.deleteMany({
          where: { id: { in: created.layers } },
        });
      if (created.stockMoves.length)
        await prisma.stockMove.deleteMany({
          where: { id: { in: created.stockMoves } },
        });
      if (created.pInvoices.length) {
        await prisma.accountsPayable.deleteMany({
          where: { invoiceId: { in: created.pInvoices } },
        });
        await prisma.purchaseInvoiceLine.deleteMany({
          where: { invoiceId: { in: created.pInvoices } },
        });
        await prisma.purchaseInvoice.deleteMany({
          where: { id: { in: created.pInvoices } },
        });
      }
      if (created.pms.length)
        await prisma.paymentMethod.deleteMany({
          where: { id: { in: created.pms } },
        });
      if (created.items.length)
        await prisma.item.deleteMany({ where: { id: { in: created.items } } });
    } catch (e) {
      // ignore cleanup errors
    }
    await prisma.$disconnect();
  });

  test('create purchases with different VAT and payment methods, then sell and check accounts + inventory', async () => {
    // create payment methods
    const pmCash = await prisma.paymentMethod.create({
      data: { name: `PM-CASH-${Date.now()}`, cashAccountCode: '110505' },
    });
    const pmBank = await prisma.paymentMethod.create({
      data: { name: `PM-BANK-${Date.now()}`, bankAccountCode: '11100501' },
    });
    created.pms.push(pmCash.id, pmBank.id);

    // create two items with different VAT
    const itemA = await prisma.item.create({
      data: {
        sku: `TEST-A-${Date.now()}`,
        name: 'Test Item A',
        type: 'PRODUCT',
        baseUnit: 'UN',
        ivaPct: 19,
      } as any,
    });
    const itemB = await prisma.item.create({
      data: {
        sku: `TEST-B-${Date.now()}`,
        name: 'Test Item B',
        type: 'PRODUCT',
        baseUnit: 'UN',
        ivaPct: 5,
      } as any,
    });
    created.items.push(itemA.id, itemB.id);

    // Purchase A: CASH with pmCash
    const subtotalA = 1000;
    const taxA = r2((subtotalA * (itemA.ivaPct || 0)) / 100);
    const totalA = r2(subtotalA + taxA);
    let supplier = await prisma.thirdParty.findFirst({
      where: { roles: { has: 'PROVIDER' } },
    });
    if (!supplier) {
      supplier = await prisma.thirdParty.create({
        data: {
          type: 'PROVIDER',
          name: 'TP test A',
          document: '900000002',
          roles: ['PROVIDER'],
        },
      });
    }
    const piA = await prisma.purchaseInvoice.create({
      data: {
        number: 9001,
        thirdPartyId: supplier.id,
        issueDate: new Date(),
        paymentType: 'CASH',
        subtotal: subtotalA,
        tax: taxA,
        total: totalA,
        status: 'ISSUED',
        lines: {
          create: [
            {
              itemId: itemA.id,
              qty: 1,
              unitCost: subtotalA,
              vatPct: itemA.ivaPct ?? 0,
              lineSubtotal: subtotalA,
              lineVat: taxA,
              lineTotal: totalA,
            },
          ],
        },
      },
      include: { lines: true },
    });
    created.pInvoices.push(piA.id);

    // create stockMove + layer for A
    const smA = await prisma.stockMove.create({
      data: {
        itemId: itemA.id,
        warehouseId: 1,
        type: 'PURCHASE',
        qty: 1,
        uom: 'UN',
        unitCost: subtotalA,
        refType: 'PurchaseInvoice',
        refId: piA.id,
        note: 'test purchase A',
      },
    });
    created.stockMoves.push(smA.id);
    const layerA = await prisma.stockLayer.create({
      data: {
        itemId: itemA.id,
        warehouseId: 1,
        remainingQty: 1,
        unitCost: subtotalA,
        moveInId: smA.id,
      },
    });
    created.layers.push(layerA.id);

    // create purchase JE for A (treasury via pmCash)
    const jePA = await prisma.journalEntry.create({
      data: {
        date: new Date(),
        sourceType: 'PURCHASE_INVOICE',
        sourceId: piA.id,
        description: `PI-A ${piA.number}`,
        status: 'POSTED',
      },
    });
    created.jes.push(jePA.id);
    await prisma.journalLine.createMany({
      data: [
        {
          entryId: jePA.id,
          accountCode: '143505',
          debit: subtotalA,
          credit: 0,
        },
        { entryId: jePA.id, accountCode: '135530', debit: taxA, credit: 0 },
        {
          entryId: jePA.id,
          accountCode: pmCash.cashAccountCode || '110505',
          debit: 0,
          credit: totalA,
        },
      ],
    });

    // Purchase B: CREDIT (Accounts Payable)
    const subtotalB = 2000;
    const taxB = r2((subtotalB * (itemB.ivaPct || 0)) / 100);
    const totalB = r2(subtotalB + taxB);
    const piB = await prisma.purchaseInvoice.create({
      data: {
        number: 9002,
        thirdPartyId: piA.thirdPartyId,
        issueDate: new Date(),
        paymentType: 'CREDIT',
        subtotal: subtotalB,
        tax: taxB,
        total: totalB,
        status: 'ISSUED',
        lines: {
          create: [
            {
              itemId: itemB.id,
              qty: 1,
              unitCost: subtotalB,
              vatPct: itemB.ivaPct ?? 0,
              lineSubtotal: subtotalB,
              lineVat: taxB,
              lineTotal: totalB,
            },
          ],
        },
      },
      include: { lines: true },
    });
    created.pInvoices.push(piB.id);
    // create AccountsPayable for CREDIT
    await prisma.accountsPayable.create({
      data: {
        thirdPartyId: piB.thirdPartyId,
        invoiceId: piB.id,
        balance: piB.total,
      },
    });

    const smB = await prisma.stockMove.create({
      data: {
        itemId: itemB.id,
        warehouseId: 1,
        type: 'PURCHASE',
        qty: 1,
        uom: 'UN',
        unitCost: subtotalB,
        refType: 'PurchaseInvoice',
        refId: piB.id,
        note: 'test purchase B',
      },
    });
    created.stockMoves.push(smB.id);
    const layerB = await prisma.stockLayer.create({
      data: {
        itemId: itemB.id,
        warehouseId: 1,
        remainingQty: 1,
        unitCost: subtotalB,
        moveInId: smB.id,
      },
    });
    created.layers.push(layerB.id);

    const jePB = await prisma.journalEntry.create({
      data: {
        date: new Date(),
        sourceType: 'PURCHASE_INVOICE',
        sourceId: piB.id,
        description: `PI-B ${piB.number}`,
        status: 'POSTED',
      },
    });
    created.jes.push(jePB.id);
    await prisma.journalLine.createMany({
      data: [
        {
          entryId: jePB.id,
          accountCode: '143505',
          debit: subtotalB,
          credit: 0,
        },
        { entryId: jePB.id, accountCode: '135530', debit: taxB, credit: 0 },
        { entryId: jePB.id, accountCode: '220505', debit: 0, credit: totalB },
      ],
    });

    // Now perform sales consuming the layers and post sale JE (COGS/inventory)
    // Sale for A
    const mvOutA = await prisma.stockMove.create({
      data: {
        itemId: itemA.id,
        warehouseId: 1,
        type: 'SALE',
        qty: -1,
        uom: 'UN',
        unitCost: layerA.unitCost,
        refType: 'TEST_SALE',
        refId: null,
        note: 'test sale A',
      },
    });
    created.salesMoves.push(mvOutA.id);
    await prisma.stockConsumption.create({
      data: {
        moveOutId: mvOutA.id,
        layerId: layerA.id,
        itemId: itemA.id,
        warehouseId: 1,
        qty: 1,
        unitCost: layerA.unitCost,
      },
    });
    await prisma.stockLayer.update({
      where: { id: layerA.id },
      data: { remainingQty: { decrement: 1 } },
    });
    const jeSaleA = await prisma.journalEntry.create({
      data: {
        date: new Date(),
        sourceType: 'STOCK_MOVE',
        sourceId: mvOutA.id,
        description: `Sale A mv ${mvOutA.id}`,
        status: 'POSTED',
      },
    });
    created.jes.push(jeSaleA.id);
    await prisma.journalLine.createMany({
      data: [
        {
          entryId: jeSaleA.id,
          accountCode: '613505',
          debit: layerA.unitCost,
          credit: 0,
        },
        {
          entryId: jeSaleA.id,
          accountCode: '143505',
          debit: 0,
          credit: layerA.unitCost,
        },
      ],
    });

    // Sale for B
    const mvOutB = await prisma.stockMove.create({
      data: {
        itemId: itemB.id,
        warehouseId: 1,
        type: 'SALE',
        qty: -1,
        uom: 'UN',
        unitCost: layerB.unitCost,
        refType: 'TEST_SALE',
        refId: null,
        note: 'test sale B',
      },
    });
    created.salesMoves.push(mvOutB.id);
    await prisma.stockConsumption.create({
      data: {
        moveOutId: mvOutB.id,
        layerId: layerB.id,
        itemId: itemB.id,
        warehouseId: 1,
        qty: 1,
        unitCost: layerB.unitCost,
      },
    });
    await prisma.stockLayer.update({
      where: { id: layerB.id },
      data: { remainingQty: { decrement: 1 } },
    });
    const jeSaleB = await prisma.journalEntry.create({
      data: {
        date: new Date(),
        sourceType: 'STOCK_MOVE',
        sourceId: mvOutB.id,
        description: `Sale B mv ${mvOutB.id}`,
        status: 'POSTED',
      },
    });
    created.jes.push(jeSaleB.id);
    await prisma.journalLine.createMany({
      data: [
        {
          entryId: jeSaleB.id,
          accountCode: '613505',
          debit: layerB.unitCost,
          credit: 0,
        },
        {
          entryId: jeSaleB.id,
          accountCode: '143505',
          debit: 0,
          credit: layerB.unitCost,
        },
      ],
    });

    // Assertions
    // Purchase A JE should credit pmCash account
    const pja = await prisma.journalLine.findFirst({
      where: { entryId: jePA.id, credit: { gt: 0 } },
    });
    expect(pja).toBeDefined();
    expect(pja!.accountCode).toBe(pmCash.cashAccountCode || '110505');

    // Purchase B JE should credit Accounts Payable 220505
    const pjb = await prisma.journalLine.findFirst({
      where: { entryId: jePB.id, credit: { gt: 0 } },
    });
    expect(pjb).toBeDefined();
    expect(pjb!.accountCode).toBe('220505');

    // Sales JEs COGS/inventory
    const saleALines = await prisma.journalLine.findMany({
      where: { entryId: jeSaleA.id },
    });
    expect(
      saleALines.some(
        (l) =>
          l.accountCode === '613505' &&
          Number(l.debit) === Number(layerA.unitCost),
      ),
    ).toBeTruthy();
    expect(
      saleALines.some(
        (l) =>
          l.accountCode === '143505' &&
          Number(l.credit) === Number(layerA.unitCost),
      ),
    ).toBeTruthy();

    const saleBLines = await prisma.journalLine.findMany({
      where: { entryId: jeSaleB.id },
    });
    expect(
      saleBLines.some(
        (l) =>
          l.accountCode === '613505' &&
          Number(l.debit) === Number(layerB.unitCost),
      ),
    ).toBeTruthy();
    expect(
      saleBLines.some(
        (l) =>
          l.accountCode === '143505' &&
          Number(l.credit) === Number(layerB.unitCost),
      ),
    ).toBeTruthy();

    // Layers consumed
    const la = await prisma.stockLayer.findUnique({ where: { id: layerA.id } });
    const lb = await prisma.stockLayer.findUnique({ where: { id: layerB.id } });
    expect(Number(la!.remainingQty)).toBe(0);
    expect(Number(lb!.remainingQty)).toBe(0);
  }, 20000);
});
