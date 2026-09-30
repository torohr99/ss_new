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
  const BATCH_SIZE = 100;

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

      for (const league of leagues) {
        try {
          let currentWeek =
            currentWeekBySeason.get(
              league.season
            );

          if (currentWeek === undefined) {
            currentWeek =
              await getCurrentFantasyWeek(
                league.season
              );

            currentWeekBySeason.set(
              league.season,
              currentWeek
            );
          }

          for (
            let week = 1;
            week <= currentWeek;
            week++
          ) {
            const existingFinal =
              await prisma.fantasyMatchup.count({
                where: {
                  leagueId: league.id,
                  weekNumber: week,
                  status: 'FINAL'
                }
              });

            const matchupCount =
              await prisma.fantasyMatchup.count({
                where: {
                  leagueId: league.id,
                  weekNumber: week
                }
              });

            if (
              matchupCount > 0 &&
              existingFinal === matchupCount
            ) {
              continue;
            }

            await generateMissingMatchups(
              league.id,
              week
            );

            const cacheKey =
              `${league.season}:${week}`;

            let weekComplete =
              weekCompleteBySeasonWeek.get(
                cacheKey
              );

            if (
              weekComplete === undefined
            ) {
              weekComplete =
                await fantasyStats.isWeekComplete(
                  league.season,
                  week
                );

              weekCompleteBySeasonWeek.set(
                cacheKey,
                weekComplete
              );
            }

            await fantasyStats.scoreLeagueWeek(
              league.id,
              week,
              !weekComplete
            );
          }
        } catch (error) {
          console.error(
            `Fantasy scoring failed for league ${league.id}:`,
            error.message
          );
        }
      }

      lastId =
        leagues[leagues.length - 1].id;

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
