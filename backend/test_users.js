const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const users = await prisma.user.findMany();
  console.log(users.map(u => u.email));
  await prisma.$disconnect();
}
run();
