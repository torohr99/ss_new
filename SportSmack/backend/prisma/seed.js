const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const teams = [
  { city: 'Atlanta', name: 'Hawks', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=ATL' },
  { city: 'Boston', name: 'Celtics', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=BOS' },
  { city: 'Chicago', name: 'Bulls', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=CHI' },
  { city: 'Dallas', name: 'Mavericks', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=DAL' },
  { city: 'Denver', name: 'Nuggets', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=DEN' },
  { city: 'Golden State', name: 'Warriors', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=GSW' },
  { city: 'Houston', name: 'Rockets', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=HOU' },
  { city: 'Los Angeles', name: 'Lakers', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=LAL' },
  { city: 'Miami', name: 'Heat', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=MIA' },
  { city: 'New York', name: 'Knicks', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=NYK' },
  { city: 'Philadelphia', name: '76ers', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=PHI' },
  { city: 'Phoenix', name: 'Suns', sport: 'Basketball', logo_url: 'https://via.placeholder.com/50?text=PHX' },
  
  { city: 'Buffalo', name: 'Bills', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=BUF' },
  { city: 'Cincinnati', name: 'Bengals', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=CIN' },
  { city: 'Kansas City', name: 'Chiefs', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=KC' },
  { city: 'Los Angeles', name: 'Rams', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=LAR' },
  { city: 'New England', name: 'Patriots', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=NE' },
  { city: 'San Francisco', name: '49ers', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=SF' },
  { city: 'Tampa Bay', name: 'Buccaneers', sport: 'Football', logo_url: 'https://via.placeholder.com/50?text=TB' },
];

async function main() {
  console.log('Start seeding...');
  
  // Clear existing to prevent errors if run multiple times
  await prisma.userTeam.deleteMany();
  await prisma.team.deleteMany();

  for (const team of teams) {
    const createdTeam = await prisma.team.create({
      data: team,
    });
    console.log(`Created team with id: ${createdTeam.id}`);
  }
  
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
