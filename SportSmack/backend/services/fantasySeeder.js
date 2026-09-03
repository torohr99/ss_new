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
  console.log('Starting NFL Fantasy Player Seeding...');

  let totalAdded = 0;

  try {
    const teamsRes = await axios.get(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
      {
        timeout: 15000
      }
    );

    const teams =
      teamsRes.data?.sports?.[0]?.leagues?.[0]?.teams || [];

    if (!teams.length) {
      throw new Error('ESPN returned no NFL teams.');
    }

    console.log(`Found ${teams.length} NFL teams.`);

    for (const teamWrapper of teams) {
      const team = teamWrapper?.team;

      if (!team?.id || !team?.abbreviation) {
        continue;
      }

      const teamId = team.id;
      const teamAbbrev = String(team.abbreviation).toUpperCase();

      try {
        const rosterRes = await axios.get(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`,
          {
            timeout: 15000
          }
        );

        const rawAthletes = rosterRes.data?.athletes || [];

        // ESPN normally returns groups such as offense/defense.
        // Flatten both grouped and already-flat responses.
        const athletes = rawAthletes.flatMap(group => {
          if (Array.isArray(group?.items)) {
            return group.items;
          }

          if (group?.id || group?.fullName) {
            return [group];
          }

          return [];
        });

        console.log(
          `${teamAbbrev}: found ${athletes.length} roster entries.`
        );

        for (const item of athletes) {
          const position =
            typeof item.position === 'string'
              ? item.position
              : item.position?.abbreviation;

          if (!VALID_POSITIONS.has(position)) {
            continue;
          }

          if (!item.id || !item.fullName) {
            continue;
          }

          const jerseyNumber =
            item.jersey !== undefined &&
            item.jersey !== null &&
            String(item.jersey).trim() !== ''
              ? String(item.jersey)
              : null;

          const imageUrl =
            item.headshot?.href ||
            item.headshot?.url ||
            null;

          const byeWeek =
            item.byeWeek !== undefined &&
            item.byeWeek !== null
              ? Number(item.byeWeek)
              : null;

          const projectedPoints =
            item.projectedPoints !== undefined &&
            item.projectedPoints !== null
              ? Number(item.projectedPoints)
              : null;

          await prisma.fantasyPlayer.upsert({
            where: {
              espnId: String(item.id)
            },
            update: {
              name: item.fullName,
              position,
              team: teamAbbrev,
              jerseyNumber,
              imageUrl,
              byeWeek: Number.isFinite(byeWeek)
                ? byeWeek
                : null,
              projectedPoints: Number.isFinite(projectedPoints)
                ? projectedPoints
                : null
            },
            create: {
              espnId: String(item.id),
              name: item.fullName,
              position,
              team: teamAbbrev,
              jerseyNumber,
              imageUrl,
              byeWeek: Number.isFinite(byeWeek)
                ? byeWeek
                : null,
              projectedPoints: Number.isFinite(projectedPoints)
                ? projectedPoints
                : null
            }
          });

          totalAdded++;
        }
      } catch (teamError) {
        console.error(
          `Error fetching roster for ${teamAbbrev}:`,
          teamError.message
        );
      }

      // Small delay between ESPN requests.
      await new Promise(resolve =>
        setTimeout(resolve, 300)
      );
    }

    console.log(
      `Successfully seeded/updated ${totalAdded} fantasy players.`
    );

    if (totalAdded === 0) {
      throw new Error(
        'ESPN returned no usable fantasy players.'
      );
    }

    return totalAdded;
  } catch (error) {
    console.error(
      'Error seeding fantasy players:',
      error.message
    );

    throw error;
  }
}

module.exports = {
  seedFantasyPlayers
};
