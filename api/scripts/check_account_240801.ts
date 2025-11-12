import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const a = await prisma.coaAccount.findFirst({ where: { code: '240801' } });
    console.log('found coaAccount 240801:', a);
  } catch (e) {
    console.error('error querying prisma:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
