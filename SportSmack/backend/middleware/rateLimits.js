const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } =
  require('express-rate-limit');
const { RedisStore } =
  require('rate-limit-redis');
const redis = require('../lib/redis');

function userOrIpKeyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

const redisStore = prefix =>
  new RedisStore({
    sendCommand: (...args) =>
      redis.call(...args),
    prefix
  });

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisStore('rl:standard:'),
  message: {
    error:
      'Too many requests. Please try again later.'
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: redisStore('rl:auth:'),
  message: {
    error:
      'Too many authentication attempts. Please try again later.'
  }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  store: redisStore('rl:write:'),
  message: {
    error:
      'Too many requests. Please slow down.'
  }
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  store: redisStore('rl:ai:'),
  message: {
    error:
      'AI usage limit reached. Please try again later.'
  }
});

const socialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  store: redisStore('rl:social:'),
  message: {
    error:
      'Too many social actions. Please slow down.'
  }
});

const postCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  store: redisStore('rl:post:'),
  message: {
    error:
      'You are posting too quickly. Please wait a moment.'
  }
});

const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  store: redisStore('rl:report:'),
  message: {
    error:
      'Too many reports. Please try again later.'
  }
});

module.exports = {
  standardLimiter,
  authLimiter,
  writeLimiter,
  aiLimiter,
  socialLimiter,
  postCreationLimiter,
  reportLimiter
};
