const prisma = require('../lib/prisma');

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
        draftOrder: 'asc'
      },
      select: {
        id: true,
        draftOrder: true
      }
    });

  if (teams.length < 2) {
    throw new Error(
      'At least two teams are required.'
    );
  }

  const rotation = [...teams];

  // Circle-method rotation.
  const fixed =
    rotation.shift();

  for (
    let i = 0;
    i < weekNumber - 1;
    i++
  ) {
    rotation.unshift(
      rotation.pop()
    );
  }

  const ordered = [
    fixed,
    ...rotation
  ];

  const matchupData = [];

  for (
    let i = 0;
    i < Math.floor(
      ordered.length / 2
    );
    i++
  ) {
    const home =
      ordered[i];

    const away =
      ordered[
        ordered.length - 1 - i
      ];

    matchupData.push({
      leagueId,
      weekNumber,
      homeTeamId: home.id,
      awayTeamId: away.id,
      status: 'UPCOMING'
    });
  }

  return prisma.$transaction(
    async tx => {
      await tx.fantasyMatchup.deleteMany({
        where: {
          leagueId,
          weekNumber
        }
      });

      await tx.fantasyMatchup.createMany({
        data: matchupData
      });

      return tx.fantasyMatchup.findMany({
        where: {
          leagueId,
          weekNumber
        },
        orderBy: {
          id: 'asc'
        }
      });
    }
  );
}

module.exports = {
  generateWeeklyMatchups
};
