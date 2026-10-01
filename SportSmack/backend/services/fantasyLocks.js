const cache =
  require('./cache');

const FANTASY_ROSTER_LOCK_TTL_SECONDS = 30;

async function withFantasyRosterLock(
  leagueId,
  callback
) {
  const lock =
    await cache.acquireLock(
      `fantasy:roster:${leagueId}`,
      FANTASY_ROSTER_LOCK_TTL_SECONDS
    );

  if (!lock) {
    const error =
      new Error(
        `Fantasy roster operation already in progress for league ${leagueId}.`
      );

    error.code =
      'FANTASY_ROSTER_LOCKED';

    throw error;
  }

  try {
    return await callback();
  } finally {
    await cache.releaseLock(lock);
  }
}

module.exports = {
  withFantasyRosterLock
};
