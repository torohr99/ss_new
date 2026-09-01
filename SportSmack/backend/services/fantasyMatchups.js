const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function generateWeeklyMatchups(
  leagueId,
  weekNumber
) {
  const teams =
    await prisma.fantasyTeam.findMany({
      where: { leagueId },
      orderBy: { draftOrder: 'asc' }
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

  const rotation = [...teams];

  // Circle-method rotation.
  // Keeps one team fixed and rotates the others.
  const fixed = rotation.shift();

  for (let i = 0; i < weekNumber - 1; i++) {
    rotation.unshift(rotation.pop());
  }

  const ordered = [
    fixed,
    ...rotation
  ];

  const matchups = [];

  for (
    let i = 0;
    i < Math.floor(ordered.length / 2);
    i++
  ) {
    const home = ordered[i];
    const away =
      ordered[ordered.length - 1 - i];

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
