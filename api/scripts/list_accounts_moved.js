const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function listAccountsForItemName(name) {
  const item = await prisma.item.findFirst({ where: { name: { contains: name, mode: 'insensitive' } } });
  if (!item) return { item: null, accounts: [] };

  const sales = await prisma.salesInvoice.findMany({ where: { lines: { some: { itemId: item.id } } }, select: { id: true } });
  const saleIds = sales.map(s => s.id);
  const moves = await prisma.stockMove.findMany({ where: { itemId: item.id }, select: { id: true } });
  const moveIds = moves.map(m => m.id);

  const whereClauses = [];
  if (saleIds.length) whereClauses.push({ entry: { sourceType: 'SALE_INVOICE', sourceId: { in: saleIds } } });
  if (moveIds.length) whereClauses.push({ entry: { sourceType: 'STOCK_MOVE', sourceId: { in: moveIds } } });

  if (!whereClauses.length) return { item, accounts: [] };

  const lines = await prisma.journalLine.findMany({
    where: { OR: whereClauses },
    select: { accountCode: true, account: { select: { name: true, code: true } } },
  });

  const map = new Map();
  for (const l of lines) {
    const code = l.account?.code ?? l.accountCode ?? '(sin cuenta)';
    const name = l.account?.name ?? null;
    if (!map.has(code)) map.set(code, name);
  }

  const accounts = [...map.entries()].map(([code, name]) => ({ code, name }));
  return { item, accounts };
}

(async function main(){
  try {
    const names = ['arroz', 'azúcar', 'hp omen'];
    for (const n of names) {
      const r = await listAccountsForItemName(n);
      if (!r.item) {
        console.log(`\nItem no encontrado para: ${n}`);
        continue;
      }
      console.log(`\nCuentas movidas para item '${r.item.name}' (id=${r.item.id}):`);
      if (!r.accounts.length) console.log('  (No se encontraron asientos relacionados)');
      for (const a of r.accounts) console.log(' ', a.code, a.name ? `- ${a.name}` : '');
    }
  } catch (e) {
    console.error(e);
  } finally { await prisma.$disconnect(); }
})();
