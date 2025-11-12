const { PrismaClient } = require('@prisma/client');
(async function(){
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const invs = await prisma.purchaseInvoice.findMany({ orderBy: { id: 'desc' }, take: 5 });
    console.log(JSON.stringify(invs.map(i => ({ id: i.id, number: i.number, paymentType: i.paymentType })), null, 2));
  } catch (e) { console.error(e); }
  finally { await prisma.$disconnect(); }
})();
