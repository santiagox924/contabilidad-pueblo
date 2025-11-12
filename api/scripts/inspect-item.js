const { PrismaClient } = require('../node_modules/@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const [idArg] = process.argv.slice(2);
    const where = idArg ? { id: Number(idArg) } : undefined;
    const items = await prisma.item.findMany({
      where,
      select: {
        id: true,
        name: true,
        taxProfile: true,
        incomeAccountCode: true,
        expenseAccountCode: true,
        inventoryAccountCode: true,
        taxAccountCode: true,
      },
      take: where ? undefined : 10,
    });
    console.dir(items, { depth: null });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
