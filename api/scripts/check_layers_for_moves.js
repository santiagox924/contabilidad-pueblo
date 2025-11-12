const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async()=>{
  try{
    await prisma.$connect();
    const layers = await prisma.stockLayer.findMany({ where: { moveInId: { in: [161,162,163,164] } }, select: { id: true, moveInId: true, remainingQty: true, unitCost: true } });
    console.log(JSON.stringify(layers, null, 2));
  }catch(e){ console.error(e); }
  finally{ await prisma.$disconnect(); }
})();
