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
  24 * 60 * 60;

const LOCK_TTL_SECONDS =
  15 * 60;

async function syncCurrentFantasySeason() {
  const season =
    getCurrentFantasySeason();

  const syncedKey =
    `${SYNCED_KEY_PREFIX}${season}`;

  const lockKey =
    `${LOCK_KEY_PREFIX}${season}`;

  /*
   * If this season has already been successfully
   * synchronized within the last 24 hours,
   * there is nothing to do.
   *
   * This prevents the expensive ESPN seeding
   * operation from running every 5 minutes.
   */
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

  /*
   * Only one worker/replica may perform the
   * synchronization at a time.
   *
   * IMPORTANT:
   * This uses ioredis syntax:
   * 'NX', 'EX', ttl
   *
   * Do NOT use:
   * { NX: true, EX: ttl }
   */
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

  /*
   * Check the completed-sync key again after
   * acquiring the lock.
   *
   * Another worker may have completed the sync
   * between our first GET and acquiring the lock.
   */
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

    /*
     * Mark this season as synchronized for 24 hours.
     *
     * The lock itself is intentionally NOT deleted.
     * Its 15-minute TTL provides automatic recovery
     * if the worker crashes during synchronization.
     */
    await redis.set(
      syncedKey,
      String(Date.now()),
      'EX',
      SYNC_TTL_SECONDS
    );

    console.log(
      `Fantasy season ${season} synchronization complete. ` +
      `${total} players synchronized.`
    );

    return {
      skipped: false,
      season,
      total
    };
  } catch (error) {
    console.error(
      `Fantasy season synchronization failed for ${season}:`,
      error
    );

    throw error;
  }
}

module.exports = {
  syncCurrentFantasySeason
};
