const {
  getCurrentFantasySeason
} = require('./fantasySeason');

const {
  seedFantasyPlayers
} = require('./fantasySeeder');

const redis =
  require('../lib/redis');

const SYNCED_KEY_PREFIX =
  'sportsmack:fantasy:season-synced:';

const LOCK_KEY_PREFIX =
  'sportsmack:fantasy:season-sync-lock:';

const SYNC_TTL_SECONDS =
  6 * 60 * 60;

const LOCK_TTL_SECONDS =
  15 * 60;

async function syncCurrentFantasySeason() {
  const season =
    getCurrentFantasySeason();

  const syncedKey =
    `${SYNCED_KEY_PREFIX}${season}`;

  const lockKey =
    `${LOCK_KEY_PREFIX}${season}`;

  const alreadySynced =
    await redis.get(
      syncedKey
    );

  if (alreadySynced) {
    return {
      skipped: true,
      reason: 'already-synced',
      season
    };
  }

  const lock =
    await redis.set(
      lockKey,
      `${process.pid}:${Date.now()}`,
      'NX',
      'EX',
      LOCK_TTL_SECONDS
    );

  if (!lock) {
    return {
      skipped: true,
      reason: 'sync-in-progress',
      season
    };
  }

  const syncedAfterLock =
    await redis.get(
      syncedKey
    );

  if (syncedAfterLock) {
    return {
      skipped: true,
      reason: 'already-synced',
      season
    };
  }

  try {
    console.log(
      `Starting fantasy season synchronization for ${season}.`
    );

    const total =
      await seedFantasyPlayers();

    if (
      !Number.isFinite(total) ||
      total <= 0
    ) {
      throw new Error(
        `Fantasy season ${season} synchronization produced no players.`
      );
    }

    await redis.set(
      syncedKey,
      String(Date.now()),
      'EX',
      SYNC_TTL_SECONDS
    );

    console.log(
      `Fantasy season ${season} synchronization completed successfully with ${total} players.`
    );

    return {
      skipped: false,
      season,
      total
    };
  } catch (error) {
    console.error(
      `Fantasy season ${season} synchronization failed:`,
      error.message
    );

    throw error;
  }
}

module.exports = {
  syncCurrentFantasySeason
};
