const prisma = require('../lib/prisma');
const fantasyStats =
  require('./fantasyStats');
const {
  processAllDueWaivers
} = require('./fantasyWaivers');

let intervalId = null;

async function scoreActiveLeagues() {
  try {
    const leagues =
      await prisma.fantasyLeague.findMany({
        where: {
          status: 'SEASON'
        }
      });

    const seasonStart =
      new Date('2026-09-09T00:00:00Z');

    const now = new Date();

    const currentWeek =
      Math.min(
        18,
        Math.max(
          1,
          Math.floor(
            (now - seasonStart) /
              (7 * 24 * 60 * 60 * 1000)
          ) + 1
        )
      );

    for (const league of leagues) {
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

  // Then every 5 minutes.
  intervalId = setInterval(
    async () => {
      await scoreActiveLeagues();
      await processDueWaivers();
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
