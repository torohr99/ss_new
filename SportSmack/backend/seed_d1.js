const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function run() {
  console.log('Fetching D1 Colleges from ESPN...');
  const res = await axios.get('http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=400');
  const teamsList = res.data.sports[0].leagues[0].teams;
  console.log(`Found ${teamsList.length} D1 teams.`);

  for (const item of teamsList) {
    const t = item.team;
    // t.location (e.g. "Syracuse"), t.name (e.g. "Orange")
    const city = t.location;
    const name = t.name;
    const logo_url = t.logos && t.logos[0] ? t.logos[0].href : 'https://via.placeholder.com/50?text=COL';

    // Find all existing teams with this city and name
    const existingTeams = await prisma.team.findMany({
      where: {
        city: city,
        name: name
      }
    });

    if (existingTeams.length > 0) {
      // Keep the first one, update it to 'College'
      const masterTeam = existingTeams[0];
      await prisma.team.update({
        where: { id: masterTeam.id },
        data: { sport: 'College', logo_url: logo_url }
      });

      // If there are duplicates, migrate UserTeams and delete them
      for (let i = 1; i < existingTeams.length; i++) {
        const dupe = existingTeams[i];
        
        // Find users following the dupe
        const follows = await prisma.userTeam.findMany({ where: { team_id: dupe.id } });
        for (const f of follows) {
          // Move them to masterTeam (use upsert to avoid unique constraint crashes if they follow both)
          try {
            await prisma.userTeam.create({
              data: { user_id: f.user_id, team_id: masterTeam.id }
            });
          } catch (e) {
            // Already following masterTeam
          }
        }
        
        // Delete the dupe's UserTeams
        await prisma.userTeam.deleteMany({ where: { team_id: dupe.id } });
        // Delete the dupe
        await prisma.team.delete({ where: { id: dupe.id } });
      }
    } else {
      // Insert new college
      await prisma.team.create({
        data: {
          city: city,
          name: name,
          logo_url: logo_url,
          sport: 'College'
        }
      });
    }
  }

  console.log('Finished migrating and seeding D1 colleges!');
  await prisma.$disconnect();
}

run().catch(console.error);
