const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LEAGUE_MAP = {
  nfl: { sport: 'football', league: 'nfl', sportName: 'Football' },
  nba: { sport: 'basketball', league: 'nba', sportName: 'Basketball' },
  mlb: { sport: 'baseball', league: 'mlb', sportName: 'Baseball' },
  nhl: { sport: 'hockey', league: 'nhl', sportName: 'Hockey' },
  wnba: { sport: 'basketball', league: 'wnba', sportName: 'Basketball' },
  'premier-league': { sport: 'soccer', league: 'eng.1', sportName: 'Soccer' }
};

async function main() {
  console.log('Fetching existing teams...');
  const existingTeams = await prisma.team.findMany();
  // Create a normalized set to prevent exact duplicates (e.g., "Los Angeles Lakers")
  const existingNames = new Set(existingTeams.map(t => `${t.city} ${t.name}`.toLowerCase()));

  for (const leagueKey of Object.keys(LEAGUE_MAP)) {
    const mapping = LEAGUE_MAP[leagueKey];
    console.log(`Fetching teams for ${leagueKey}...`);
    try {
      const response = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/${mapping.sport}/${mapping.league}/teams`);
      const teamsList = response.data.sports[0].leagues[0].teams;

      for (const t of teamsList) {
        const espnTeam = t.team;
        let city = espnTeam.location || '';
        let name = espnTeam.name || espnTeam.nickname || '';
        
        // Handle cases where team name is single word (e.g. Arsenal)
        if (!name && city) {
          name = city;
          city = '';
        }

        const fullName = `${city} ${name}`.trim().toLowerCase();
        
        if (!existingNames.has(fullName)) {
          const logo_url = (espnTeam.logos && espnTeam.logos[0] && espnTeam.logos[0].href) 
            ? espnTeam.logos[0].href 
            : `https://via.placeholder.com/50?text=${espnTeam.abbreviation || 'TEAM'}`;
          
          const newTeam = await prisma.team.create({
            data: {
              city,
              name,
              sport: mapping.sportName,
              logo_url
            }
          });
          console.log(`Added: ${newTeam.city} ${newTeam.name} (${newTeam.id})`);
          existingNames.add(fullName);
        } else {
          // If we already have the team, maybe we update the logo if it's currently a placeholder?
          const existingDbTeam = existingTeams.find(dbT => `${dbT.city} ${dbT.name}`.toLowerCase() === fullName);
          if (existingDbTeam && existingDbTeam.logo_url.includes('via.placeholder.com') && espnTeam.logos && espnTeam.logos[0]) {
             await prisma.team.update({
               where: { id: existingDbTeam.id },
               data: { logo_url: espnTeam.logos[0].href }
             });
             console.log(`Updated logo for: ${existingDbTeam.city} ${existingDbTeam.name}`);
          }
        }
      }
    } catch (err) {
      console.error(`Error processing ${leagueKey}:`, err.message);
    }
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
