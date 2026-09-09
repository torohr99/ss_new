const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error(
    'REDIS_URL environment variable is required.'
  );
}

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false
});

redis.on('connect', () => {
  console.log('Redis connection established.');
});

redis.on('ready', () => {
  console.log('Redis connection ready.');
});

redis.on('error', error => {
  console.error(
    'Redis connection error:',
    error.message
  );
});

redis.on('close', () => {
  console.warn('Redis connection closed.');
});

module.exports = redis;
