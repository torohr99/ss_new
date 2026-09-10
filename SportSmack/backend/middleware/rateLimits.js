const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../lib/redis');

const createRedisStore = (prefix) =>
  new RedisStore({
    prefix,
    sendCommand: (command, ...args) =>
      redis.call(command, ...args)
  });

function userOrIpKeyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:standard:'),
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
  store: createRedisStore('rl:auth:'),
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
  store: createRedisStore('rl:write:'),
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
  store: createRedisStore('rl:ai:'),
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
  keyGenerator: req =>
    req.user?.id
      ? `user:${req.user.id}`
      : `ip:${req.ip}`,
  store: createRedisStore('rl:social:'),
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
  keyGenerator: req =>
    req.user?.id
      ? `user:${req.user.id}`
      : `ip:${req.ip}`,
  store: createRedisStore('rl:posts:'),
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
  keyGenerator: req =>
    req.user?.id
      ? `user:${req.user.id}`
      : `ip:${req.ip}`,
  store: createRedisStore('rl:reports:'),
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
