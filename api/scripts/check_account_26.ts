import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const a = await prisma.coaAccount.findFirst({ where: { code: '26' } });
    console.log('found coaAccount 26:', a);
  } catch (e) {
    console.error('error querying prisma:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
