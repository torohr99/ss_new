const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateWeeklyMatchups(
  leagueId,
  weekNumber
) {
  const teams =
    await prisma.fantasyTeam.findMany({
      where: {
        leagueId
      },
      orderBy: {
        id: 'asc'
      }
    });

  if (teams.length < 2) {
    throw new Error(
      'At least two teams are required.'
    );
  }

  await prisma.fantasyMatchup.deleteMany({
    where: {
      leagueId,
      weekNumber
    }
  });

  const matchups = [];

  for (
    let i = 0;
    i < teams.length;
    i += 2
  ) {
    const home = teams[i];
    const away = teams[i + 1];

    if (!away) continue;

    const matchup =
      await prisma.fantasyMatchup.create({
        data: {
          leagueId,
          weekNumber,
          homeTeamId: home.id,
          awayTeamId: away.id,
          status: 'UPCOMING'
        }
      });

    matchups.push(matchup);
  }

  return matchups;
}

module.exports = {
  generateWeeklyMatchups
};
