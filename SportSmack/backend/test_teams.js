const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const teams = await prisma.team.findMany();
  console.log('Total teams:', teams.length);
  console.log(teams.slice(0, 10));
  await prisma.$disconnect();
}

run();
