const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Cuentas (copia reducida de accounts.map)
const ACCOUNTS = {
  inventory: '143505',
  cogs: '613505',
  purchaseVat: '135530',
  ap: '220505',
  RET_RTF_PURCH_LIAB: '236540',
};

function r2(n){return Math.round((n+Number.EPSILON)*100)/100}

(async function main(){
  try {
    await prisma.$connect();

    const names = ['arroz', 'azúcar', 'hp omen'];

    // Find or create a supplier (thirdParty) with PROVIDER role
    let supplier = await prisma.thirdParty.findFirst({ where: { roles: { has: 'PROVIDER' } } });
    if (!supplier) {
      supplier = await prisma.thirdParty.create({ data: { name: 'Proveedor de prueba', document: '900000000', roles: ['PROVIDER'] } });
      console.log('Creado proveedor de prueba id=', supplier.id);
    }

    for (const name of names) {
      console.log('\n--- Prueba de compra para item que contiene:', name, '---');
      const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
      if (!item) { console.log('Item no encontrado:', name); continue; }
      console.log('Item:', item.id, item.name, 'baseUnit=', item.baseUnit);

      // Datos de la compra
      const qty = 1;
      const unitCost = item.baseUnit && item.baseUnit.toLowerCase().includes('kg') ? 1000 : (item.baseUnit === 'G' ? 1500 : 800000);
      const vatPct = 19;
      const subtotal = r2(qty * unitCost);
      const tax = r2(subtotal * vatPct / 100);
      const total = r2(subtotal + tax);

      // Crear la factura de compra
      const inv = await prisma.purchaseInvoice.create({
        data: {
          number: (await prisma.purchaseInvoice.findFirst({ select: { number: true }, orderBy: { number: 'desc' } })).number + 1 || 6000,
          thirdPartyId: supplier.id,
          issueDate: new Date(),
          dueDate: null,
          paymentType: 'CASH',
          subtotal,
          tax,
          total,
          status: 'ISSUED',
          lines: { create: [{ itemId: item.id, qty, unitCost, vatPct, lineSubtotal: subtotal, lineVat: tax, lineTotal: total }] },
        },
        include: { lines: true },
      });

      // Crear CxP
      await prisma.accountsPayable.create({ data: { thirdPartyId: supplier.id, invoiceId: inv.id, balance: inv.total } });

      // Crear asiento simplificado (como hace postPurchaseInvoice)
      const je = await prisma.journalEntry.create({ data: { date: new Date(), sourceType: 'PURCHASE_INVOICE', sourceId: inv.id, description: `FC ${inv.number}`, status: 'POSTED' } });

      const lines = [];
      // débito inventario o gasto -> usar inventory por defecto
      lines.push({ accountCode: ACCOUNTS.inventory, debit: subtotal, credit: 0 });
      // débito IVA compras
      if (tax > 0) lines.push({ accountCode: ACCOUNTS.purchaseVat, debit: tax, credit: 0 });
      // crédito CxP por total
      lines.push({ accountCode: ACCOUNTS.ap, debit: 0, credit: r2(total) });

      // Persistir líneas
      for (const l of lines) {
        await prisma.journalLine.create({ data: { entryId: je.id, accountCode: l.accountCode, debit: l.debit, credit: l.credit } });
      }

      // Mostrar qué cuentas se movieron
      console.log('Factura creada id=', inv.id, 'number=', inv.number, 'subtotal=', subtotal, 'tax=', tax, 'total=', total);
      console.log('Cuentas movidas:');
      for (const l of lines) console.log(' ', l.accountCode, l.debit ? `debit=${l.debit}` : `credit=${l.credit}`);
    }
  } catch (e) {
    console.error(e);
  } finally { await prisma.$disconnect(); }
})();
