const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const d = await prisma.team.findMany({ where: { name: 'Blue Devils' } });
  console.log(d);
  await prisma.$disconnect();
}
run();
