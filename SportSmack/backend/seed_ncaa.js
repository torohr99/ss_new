const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const NCAA_LEAGUES = [
  { sport: 'basketball', league: 'mens-college-basketball', display: 'ncaam' },
  { sport: 'basketball', league: 'womens-college-basketball', display: 'ncaaw' },
  { sport: 'football', league: 'college-football', display: 'ncaaf' },
  { sport: 'baseball', league: 'college-baseball', display: 'ncaab' }
];

async function seed() {
  console.log('Starting NCAA seed...');
  for (const { sport, league, display } of NCAA_LEAGUES) {
    console.log(`Fetching teams for ${display}...`);
    try {
      const res = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams?limit=250`);
      if (res.data && res.data.sports && res.data.sports[0] && res.data.sports[0].leagues[0]) {
        const teams = res.data.sports[0].leagues[0].teams;
        let added = 0;
        
        for (const t of teams) {
          const team = t.team;
          // Check if exists
          const existing = await prisma.team.findFirst({
            where: { sport: sport, name: team.name }
          });
          
          if (!existing) {
            await prisma.team.create({
              data: {
                city: team.location || team.name,
                name: team.name,
                logo_url: team.logos ? team.logos[0].href : 'https://a.espncdn.com/i/teamlogos/default-team-logo-500.png',
                sport: sport // We store the base sport ('football', 'basketball', etc)
              }
            });
            added++;
          }
        }
        console.log(`Added ${added} new teams for ${display}.`);
      }
    } catch (e) {
      console.error(`Error fetching ${display}:`, e.message);
    }
  }
  console.log('Seed complete.');
}

seed().catch(console.error).finally(() => prisma.$disconnect());
