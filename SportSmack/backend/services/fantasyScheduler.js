const prisma = require('../lib/prisma');
const fantasyStats =
  require('./fantasyStats');
const {
  processAllDueWaivers
} = require('./fantasyWaivers');
const {
  processBotTransactions
} = require('./fantasyBotManager');

const {
  syncCurrentFantasySeason
} = require('./fantasySeasonSync');

const {
  getCurrentFantasyWeek
} = require('./fantasySchedule');

let intervalId = null;

async function scoreActiveLeagues() {
  const BATCH_SIZE = 250;

  try {
    const currentWeekBySeason = new Map();
    const weekCompleteBySeasonWeek = new Map();

    let lastId = null;

    while (true) {
      const leagues =
        await prisma.fantasyLeague.findMany({
          where: {
            status: 'SEASON',
            ...(lastId !== null
              ? {
                  id: {
                    gt: lastId
                  }
                }
              : {})
          },
          orderBy: {
            id: 'asc'
          },
          take: BATCH_SIZE,
          select: {
            id: true,
            season: true
          }
        });

      if (leagues.length === 0) {
        break;
      }

      /*
       * Group leagues by season so that current-week
       * and week-completion information is reused.
       */
      const leaguesBySeason = new Map();

      for (const league of leagues) {
        if (!leaguesBySeason.has(league.season)) {
          leaguesBySeason.set(
            league.season,
            []
          );
        }

        leaguesBySeason
          .get(league.season)
          .push(league);
      }

      /*
       * Determine which league/week combinations
       * actually require work.
       *
       * The current week is always included.
       * Older weeks are included only when they
       * still have non-final matchups.
       */
      const workItems = [];

      for (const [
        season,
        seasonLeagues
      ] of leaguesBySeason) {
        let currentWeek =
          currentWeekBySeason.get(
            season
          );

        if (currentWeek === undefined) {
          currentWeek =
            await getCurrentFantasyWeek(
              season
            );

          currentWeekBySeason.set(
            season,
            currentWeek
          );
        }

        const leagueIds =
          seasonLeagues.map(
            league => league.id
          );

        const unfinishedMatchups =
          await prisma.fantasyMatchup.findMany({
            where: {
              leagueId: {
                in: leagueIds
              },
              weekNumber: {
                lte: currentWeek
              },
              status: {
                not: 'FINAL'
              }
            },
            select: {
              leagueId: true,
              weekNumber: true
            },
            distinct: [
              'leagueId',
              'weekNumber'
            ]
          });

        const workKeys = new Set();

        /*
         * Always process the current week.
         */
        for (const league of seasonLeagues) {
          const key =
            `${league.id}:${currentWeek}`;

          workKeys.add(key);

          workItems.push({
            leagueId: league.id,
            season,
            weekNumber: currentWeek
          });
        }

        /*
         * Recover any previous weeks that have
         * unfinished matchups.
         */
        for (
          const matchup
            of unfinishedMatchups
        ) {
          const key =
            `${matchup.leagueId}:${matchup.weekNumber}`;

          if (workKeys.has(key)) {
            continue;
          }

          workKeys.add(key);

          workItems.push({
            leagueId:
              matchup.leagueId,
            season,
            weekNumber:
              matchup.weekNumber
          });
        }
      }

      /*
       * Determine completion once per
       * season/week, not once per league.
       */
      for (const item of workItems) {
        try {
          const cacheKey =
            `${item.season}:${item.weekNumber}`;

          let weekComplete =
            weekCompleteBySeasonWeek.get(
              cacheKey
            );

          if (
            weekComplete === undefined
          ) {
            weekComplete =
              await fantasyStats.isWeekComplete(
                item.season,
                item.weekNumber
              );

            weekCompleteBySeasonWeek.set(
              cacheKey,
              weekComplete
            );
          }

          /*
           * Generate matchups only when the league
           * does not already have them.
           */
          await generateMissingMatchups(
            item.leagueId,
            item.weekNumber
          );

          await fantasyStats.scoreLeagueWeek(
            item.leagueId,
            item.weekNumber,
            !weekComplete
          );
        } catch (error) {
          console.error(
            `Fantasy scoring failed for league ${item.leagueId}, week ${item.weekNumber}:`,
            error.message
          );
        }
      }

      lastId =
        leagues[
          leagues.length - 1
        ].id;

      if (
        leagues.length <
        BATCH_SIZE
      ) {
        break;
      }
    }
  } catch (error) {
    console.error(
      'Fantasy scheduler error:',
      error.message
    );
  }
}

function startFantasyScheduler() {
  if (intervalId) return;

  // Run immediately.
  scoreActiveLeagues();
  processDueWaivers();
  processBotTransactions();
  
  syncCurrentFantasySeason()
    .catch(error => {
      console.error(
        'Initial fantasy season synchronization failed:',
        error.message
      );
    });

  // Then every 5 minutes.
  intervalId = setInterval(
    async () => {
      await scoreActiveLeagues();
      await processDueWaivers();
      await processBotTransactions();
      await syncCurrentFantasySeason();
    },
    5 * 60 * 1000
  );

  console.log(
    'Fantasy scheduler started.'
  );
}

function stopFantasyScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

const {
  generateWeeklyMatchups
} = require('./fantasyMatchups');

async function generateMissingMatchups(
  leagueId,
  weekNumber
) {
  const existing =
    await prisma.fantasyMatchup.count({
      where: {
        leagueId,
        weekNumber
      }
    });

  if (existing > 0) {
    return;
  }

  await generateWeeklyMatchups(
    leagueId,
    weekNumber
  );
}

async function processDueWaivers() {
  const now = new Date();

  // Tuesday = 2
  // Process at/after 9:00 AM UTC on Tuesday.
  const day = now.getUTCDay();
  const hour = now.getUTCHours();

  if (day !== 2 || hour < 9) {
    return;
  }

  try {
    const results =
      await processAllDueWaivers();

    if (results.length > 0) {
      console.log(
        'Automatic fantasy waiver processing completed:',
        JSON.stringify(results)
      );
    }
  } catch (err) {
    console.error(
      'Automatic waiver processing failed:',
      err.message
    );
  }
}

module.exports = {
  startFantasyScheduler,
  stopFantasyScheduler
};
