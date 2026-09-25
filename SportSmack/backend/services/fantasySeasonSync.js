const prisma =
  require('../lib/prisma');

const {
  getCurrentFantasySeason
} = require('./fantasySeason');

const {
  seedFantasyPlayers
} = require('./fantasySeeder');

const redis =
  require('../lib/redis');

const LOCK_KEY =
  'sportsmack:fantasy:season-sync';

const LOCK_TTL_SECONDS =
  15 * 60;

async function syncCurrentFantasySeason() {
  const season =
    getCurrentFantasySeason();

  const lock =
    await redis.set(
      LOCK_KEY,
      `${process.pid}:${Date.now()}`,
      {
        NX: true,
        EX: LOCK_TTL_SECONDS
      }
    );

  if (!lock) {
    return {
      skipped: true,
      season
    };
  }

  try {
    console.log(
      `Starting fantasy season synchronization for ${season}.`
    );

    const total =
      await seedFantasyPlayers();

    console.log(
      `Fantasy season ${season} synchronization complete. ` +
      `${total} players synchronized.`
    );

    return {
      skipped: false,
      season,
      total
    };
  } finally {
    /*
     * Do not blindly DEL the lock because another
     * process could theoretically acquire it after
     * expiration.
     *
     * The TTL provides automatic recovery if the
     * worker crashes.
     */
  }
}

module.exports = {
  syncCurrentFantasySeason
};
