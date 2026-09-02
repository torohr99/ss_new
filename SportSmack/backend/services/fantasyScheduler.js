const {
  PrismaClient
} = require('@prisma/client');

const prisma = new PrismaClient();
const fantasyStats =
  require('./fantasyStats');

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
    
    const week =
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
        await generateMissingMatchups(
          league.id,
          week
        );
    
        const weekComplete =
          await fantasyStats.isWeekComplete(week);
        
        await fantasyStats.scoreLeagueWeek(
          league.id,
          week,
          !weekComplete
        );
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

  // Then every 5 minutes.
  intervalId = setInterval(
    scoreActiveLeagues,
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
  const leagues =
    await prisma.fantasyLeague.findMany({
      where: {
        status: 'SEASON'
      }
    });

  for (const league of leagues) {
    try {
      const claims =
        await prisma.fantasyWaiverClaim.count({
          where: {
            leagueId: league.id,
            status: 'PENDING'
          }
        });

      if (claims === 0) continue;

      // For now, process once every Tuesday.
      const day = new Date().getUTCDay();

      if (day !== 2) continue;

      // Reuse the same processing logic through a
      // service function in the next cleanup step.
    } catch (err) {
      console.error(
        `Waiver processing failed for league ${league.id}:`,
        err.message
      );
    }
  }
}

module.exports = {
  startFantasyScheduler,
  stopFantasyScheduler
};
