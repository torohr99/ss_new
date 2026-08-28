const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const colleges = await prisma.team.findMany();
  // Count how many have duplicate cities
  const cityCounts = {};
  for (const c of colleges) {
    if (!cityCounts[c.city]) cityCounts[c.city] = [];
    cityCounts[c.city].push(c.sport);
  }
  const duplicates = Object.keys(cityCounts).filter(city => cityCounts[city].length > 1);
  console.log('Total teams:', colleges.length);
  console.log('Cities with multiple teams:', duplicates.length);
  console.log('Sample duplicates:', duplicates.slice(0, 5).map(c => ({ city: c, sports: cityCounts[c] })));
  
  await prisma.$disconnect();
}

run();
