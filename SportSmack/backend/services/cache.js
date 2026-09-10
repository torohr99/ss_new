const redis = require('../lib/redis');

const PREFIX = 'ss:cache:';

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

module.exports = {
  getJson,
  setJson,
  deleteKey
};
