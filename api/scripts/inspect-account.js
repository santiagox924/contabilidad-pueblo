const { PrismaClient } = require('../node_modules/@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const codes = process.argv.slice(2);
    if (codes.length === 0) {
      console.error('Usage: node scripts/inspect-account.js <code> [more codes]');
      process.exit(1);
    }
  const accounts = await prisma.coaAccount.findMany({
      where: { code: { in: codes } },
      select: {
        code: true,
        name: true,
        isDetailed: true,
        class: true,
      },
      orderBy: { code: 'asc' },
    });
    console.dir(accounts, { depth: null });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
