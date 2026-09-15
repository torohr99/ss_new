const redis = require('../lib/redis');

const PREFIX = 'ss:cache:';
const LOCK_PREFIX = 'ss:cache-lock:';

const DEFAULT_LOCK_TTL_SECONDS = 15;
const DEFAULT_WAIT_MS = 100;
const DEFAULT_MAX_WAIT_MS = 3000;

async function getJson(key) {
  const redisKey = `${PREFIX}${key}`;

  try {
    const value =
      await redis.get(redisKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      console.error(
        `Redis cache parse error for ${redisKey}:`,
        error
      );

      await redis.del(redisKey);

      return null;
    }
  } catch (error) {
    console.error(
      `Redis cache read failed for ${redisKey}:`,
      error.message
    );

    return null;
  }
}

async function setJson(
  key,
  value,
  ttlSeconds
) {
  const redisKey =
    `${PREFIX}${key}`;

  try {
    await redis.set(
      redisKey,
      JSON.stringify(value),
      'EX',
      ttlSeconds
    );
  } catch (error) {
    console.error(
      `Redis cache write failed for ${redisKey}:`,
      error.message
    );
  }
}

async function deleteKey(key) {
  const redisKey =
    `${PREFIX}${key}`;

  try {
    await redis.del(redisKey);
  } catch (error) {
    console.error(
      `Redis cache delete failed for ${redisKey}:`,
      error.message
    );
  }
}

async function acquireLock(
  key,
  ttlSeconds
) {
  const lockKey =
    `${LOCK_PREFIX}${key}`;

  const token =
    `${process.pid}-${Date.now()}-${Math.random()}`;

  const result =
    await redis.set(
      lockKey,
      token,
      'EX',
      ttlSeconds,
      'NX'
    );

  if (result !== 'OK') {
    return null;
  }

  return {
    lockKey,
    token
  };
}

async function releaseLock(lock) {
  if (!lock) {
    return;
  }

  try {
    await redis.eval(
      `
      if redis.call(
        "get",
        KEYS[1]
      ) == ARGV[1]
      then
        return redis.call(
          "del",
          KEYS[1]
        )
      else
        return 0
      end
      `,
      1,
      lock.lockKey,
      lock.token
    );
  } catch (error) {
    console.error(
      `Redis cache lock release failed for ${lock.lockKey}:`,
      error.message
    );
  }
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

/**
 * Cache-aside helper with distributed
 * single-flight protection.
 *
 * Only one application instance generates
 * a missing cache value. Other instances wait
 * briefly and then read the populated value.
 */
async function getOrSetJson(
  key,
  ttlSeconds,
  loader,
  options = {}
) {
  const lockTtlSeconds =
    options.lockTtlSeconds ||
    DEFAULT_LOCK_TTL_SECONDS;

  const waitMs =
    options.waitMs ||
    DEFAULT_WAIT_MS;

  const maxWaitMs =
    options.maxWaitMs ||
    DEFAULT_MAX_WAIT_MS;

  const cached =
    await getJson(key);

  if (cached !== null) {
    return cached;
  }

  const lock =
    await acquireLock(
      key,
      lockTtlSeconds
    );

  if (lock) {
    try {
      // Double-check the cache after acquiring
      // the lock. Another request may have filled
      // it immediately before we acquired the lock.
      const existing =
        await getJson(key);

      if (existing !== null) {
        return existing;
      }

      const value =
        await loader();

      if (value !== undefined &&
          value !== null) {
        await setJson(
          key,
          value,
          ttlSeconds
        );
      }

      return value;
    } finally {
      await releaseLock(lock);
    }
  }

  // Another instance is already generating
  // the value. Wait for it to populate Redis.
  const startedAt = Date.now();

  while (
    Date.now() - startedAt <
    maxWaitMs
  ) {
    await sleep(waitMs);

    const value =
      await getJson(key);

    if (value !== null) {
      return value;
    }
  }

  // Do not wait indefinitely. If the lock holder
  // failed, allow this request to generate the
  // value rather than returning nothing.
  try {
    const value =
      await loader();

    if (value !== undefined &&
        value !== null) {
      await setJson(
        key,
        value,
        ttlSeconds
      );
    }

    return value;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  getJson,
  setJson,
  deleteKey,
  getOrSetJson
};
