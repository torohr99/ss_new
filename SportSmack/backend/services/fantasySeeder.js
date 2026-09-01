const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
]);

async function seedFantasyPlayers() {
  try {
    console.log('Starting NFL Fantasy Player Seeding...');
    
    // 1. Fetch all 32 NFL teams
    const teamsRes = await axios.get('http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams');
    const teams = teamsRes.data.sports[0].leagues[0].teams;
    
    let totalAdded = 0;

    // 2. Iterate through teams and fetch their rosters
    for (const t of teams) {
      const teamId = t.team.id;
      const teamAbbrev = t.team.abbreviation;
      
      console.log(`Fetching roster for ${teamAbbrev}...`);
      try {
        const rosterRes = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`);
        const athletes = rosterRes.data.athletes;
        
        // athletes usually contains arrays for offense, defense, special teams
        for (const group of athletes) {
          for (const item of group.items) {
            const position = item.position.abbreviation;
            
            if (VALID_POSITIONS.has(position)) {
              // Upsert the player
              await prisma.fantasyPlayer.upsert({
                where: { espnId: String(item.id) },
                update: {
                  name: item.fullName,
                  position: position,
                  team: teamAbbrev,
                  imageUrl:
                    item.headshot
                      ? item.headshot.href
                      : null,
                  byeWeek:
                    item.byeWeek
                      ? Number(item.byeWeek)
                      : null,
                  projectedPoints:
                    item.projectedPoints
                      ? Number(item.projectedPoints)
                      : null
                },
                create: {
                  espnId: String(item.id),
                  name: item.fullName,
                  position: position,
                  team: teamAbbrev,
                  imageUrl:
                    item.headshot
                      ? item.headshot.href
                      : null,
                  byeWeek:
                    item.byeWeek
                      ? Number(item.byeWeek)
                      : null,
                  projectedPoints:
                    item.projectedPoints
                      ? Number(item.projectedPoints)
                      : null
                },
              });
              totalAdded++;
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching roster for team ${teamAbbrev}:`, err.message);
      }
      
      // Delay to respect API rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`Successfully seeded/updated ${totalAdded} fantasy players.`);
    return totalAdded;
  } catch (error) {
    console.error('Error seeding fantasy players:', error);
    throw error;
  }
}

module.exports = {
  seedFantasyPlayers
};
