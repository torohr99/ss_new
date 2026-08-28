const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const colleges = await prisma.team.findMany();
  const nameCounts = {};
  for (const c of colleges) {
    const key = c.city + '|' + c.name;
    if (!nameCounts[key]) nameCounts[key] = [];
    nameCounts[key].push(c.sport);
  }
  const duplicates = Object.keys(nameCounts).filter(k => nameCounts[k].length > 1);
  console.log('Duplicates by city+name:', duplicates.length);
  console.log(duplicates.slice(0, 10).map(k => ({ team: k, sports: nameCounts[k] })));
  await prisma.$disconnect();
}
run();
