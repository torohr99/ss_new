const {
  PrismaClient
} = require('@prisma/client');

const prisma = new PrismaClient();

const {
  scoreLeagueWeek
} = require('./fantasyStats');

async function scoreActiveLeagues() {
  const leagues =
    await prisma.fantasyLeague.findMany({
      where: {
        status: 'SEASON'
      }
    });

  for (const league of leagues) {
    try {
      const currentWeek =
        league.currentWeek || 1;

      await scoreLeagueWeek(
        league.id,
        currentWeek
      );
    } catch (err) {
      console.error(
        `Fantasy scoring failed for league ${league.id}:`,
        err.message
      );
    }
  }
}

function startFantasyScheduler() {
  // Run every 15 minutes.
  setInterval(
    scoreActiveLeagues,
    15 * 60 * 1000
  );

  console.log(
    'Fantasy scoring scheduler started.'
  );
}

module.exports = {
  startFantasyScheduler,
  scoreActiveLeagues
};
