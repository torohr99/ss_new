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

let intervalId = null;

async function scoreActiveLeagues() {
  try {
    const leagues =
      await prisma.fantasyLeague.findMany({
        where: {
          status: 'SEASON'
        }
      });

    const now =
      new Date();

    for (const league of leagues) {
      const seasonStart =
        new Date(
          `${league.season}-09-01T00:00:00Z`
        );
      
      const currentWeek =
        Math.min(
          18,
          Math.max(
            1,
            Math.floor(
              (
                now -
                seasonStart
              ) /
              (7 * 24 * 60 * 60 * 1000)
            ) + 1
          )
        );
      try {
        /*
         * Process every week through the current week,
         * but skip weeks that have already been finalized.
         *
         * This allows a league drafted late in Week 1
         * to catch up without repeatedly hitting ESPN
         * for already-finalized weeks.
         */
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

          /*
           * If every matchup for this week is already
           * FINAL, there is nothing left to do.
           */
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

          const weekComplete = 
            await fantasyStats.isWeekComplete( 
              league.season,
              week 
            );

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
  syncCurrentFantasySeason();

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
