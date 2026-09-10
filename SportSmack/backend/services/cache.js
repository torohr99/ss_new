const redis = require('../lib/redis');

async function getJson(key) {
  const value = await redis.get(key);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `Redis cache parse error for ${key}:`,
      error
    );

    await redis.del(key);

    return null;
  }
}

async function setJson(
  key,
  value,
  ttlSeconds
) {
  await redis.set(
    key,
    JSON.stringify(value),
    'EX',
    ttlSeconds
  );
}

async function deleteKey(key) {
  await redis.del(key);
}

module.exports = {
  getJson,
  setJson,
  deleteKey
};
