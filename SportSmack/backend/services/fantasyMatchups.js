const prisma =
  require('../lib/prisma');

const cache =
  require('./cache');

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

async function waitForExistingMatchups(
  leagueId,
  weekNumber
) {
  const MAX_ATTEMPTS = 30;
  const WAIT_MS = 100;

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt++
  ) {
    const matchups =
      await prisma.fantasyMatchup.findMany({
        where: {
          leagueId,
          weekNumber
        },
        orderBy: {
          id: 'asc'
        }
      });

    if (matchups.length > 0) {
      return matchups;
    }

    await sleep(WAIT_MS);
  }

  return [];
}

async function generateWeeklyMatchups(
  leagueId,
  weekNumber
) {
  const lock =
    await cache.acquireLock(
      `fantasy:matchups:${leagueId}:${weekNumber}`,
      30
    );

  /*
   * Another replica/request is already
   * generating this league/week.
   *
   * Wait briefly for it to finish instead
   * of generating a second copy.
   */
  if (!lock) {
    const existing =
      await waitForExistingMatchups(
        leagueId,
        weekNumber
      );

    if (existing.length > 0) {
      return existing;
    }

    throw new Error(
      `Matchup generation already in progress for league ${leagueId}, week ${weekNumber}.`
    );
  }

  try {
    /*
     * Double-check after acquiring the lock.
     *
     * Another request may have completed
     * generation immediately before this
     * request acquired the lock.
     */
    const existing =
      await prisma.fantasyMatchup.findMany({
        where: {
          leagueId,
          weekNumber
        },
        orderBy: {
          id: 'asc'
        }
      });

    if (existing.length > 0) {
      return existing;
    }

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
        /*
         * This delete is intentionally retained
         * because this function is also used by
         * explicit matchup-generation flows.
         *
         * The Redis lock guarantees that two
         * callers cannot perform this operation
         * concurrently for the same league/week.
         */
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
  } finally {
    await cache.releaseLock(lock);
  }
}

module.exports = {
  generateWeeklyMatchups
};
