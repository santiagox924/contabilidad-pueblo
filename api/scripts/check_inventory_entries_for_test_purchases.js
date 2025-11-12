const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async function main(){
  try{
    await prisma.$connect();
    const invoiceIds = [19,20,21,22];
    const report = [];
    for(const invId of invoiceIds){
      // Buscar stock moves que refieran a PurchaseInvoice (si se usa refType/refId)
      const movesByRef = await prisma.stockMove.findMany({ where: { refType: 'PurchaseInvoice', refId: invId } });
      // También buscar stockMoves creados por procesos que tengan note/other ref; además la app puede crear stockMoves separadamente
      const movesByInvoiceJE = await prisma.journalEntry.findMany({ where: { sourceType: 'STOCK_MOVE' }, select: { sourceId: true } });

      // Vamos a buscar stockMoves con itemId igual al de la invoice (leer lines)
      const inv = await prisma.purchaseInvoice.findUnique({ where: { id: invId }, include: { lines: true } });
      const itemIds = inv ? inv.lines.map(l=>l.itemId) : [];

      const movesByItem = itemIds.length ? await prisma.stockMove.findMany({ where: { itemId: { in: itemIds }, type: 'PURCHASE' }, orderBy: { id: 'desc' } }) : [];

      report.push({ invoiceId: invId, items: inv ? inv.lines.map(l=>({ itemId: l.itemId, qty: Number(l.qty), unitCost: Number(l.unitCost) })) : [], movesByRef: movesByRef.map(m=>({ id: m.id, itemId: m.itemId, qty: Number(m.qty), warehouseId: m.warehouseId, note: m.note })), movesByItem: movesByItem.map(m=>({ id: m.id, itemId: m.itemId, qty: Number(m.qty), warehouseId: m.warehouseId, refType: m.refType, refId: m.refId, note: m.note })) });
    }
    console.log(JSON.stringify(report, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
