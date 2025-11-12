// Cleanup script for test records created during normalization/E2E
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Known test JournalEntry IDs (from summary): 137 (global adjustment), 138-157 (E2E/bidirectional sales)
  const testJEIds = [137,138,139,140,141,142,143,144,145,146,147,148,149,150,151,152,153,154,155,156,157];
  await prisma.journalEntry.deleteMany({ where: { id: { in: testJEIds } } });

  // Remove test items by SKU prefix
  await prisma.item.deleteMany({ where: { sku: { startsWith: 'TEST-' } } });
  await prisma.item.deleteMany({ where: { sku: { startsWith: 'BID-' } } });

  // Remove test stock moves/layers by note
  await prisma.stockMove.deleteMany({ where: { note: { contains: 'test', mode: 'insensitive' } } });
  await prisma.stockLayer.deleteMany({ where: { moveIn: { note: { contains: 'test', mode: 'insensitive' } } } });

  // Remove test sales/purchase invoices by number range (138-157)
  await prisma.salesInvoice.deleteMany({ where: { number: { gte: 138, lte: 157 } } });
  // Remove test purchases by number range if used (adjust as needed)
  await prisma.purchaseInvoice.deleteMany({ where: { number: { gte: 138, lte: 157 } } });

  // Remove any other test artifacts (expand as needed)
  console.log('Test records cleanup complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
