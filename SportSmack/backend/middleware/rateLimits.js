const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/*
 * Rate-limit key generator for authenticated and unauthenticated users.
 *
 * Authenticated users are limited by their SportSmack user ID.
 * Unauthenticated users are limited by a normalized IP address.
 *
 * ipKeyGenerator() is required by express-rate-limit v8 to safely
 * handle IPv6 addresses.
 */
function userOrIpKeyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

/*
 * General API limiter.
 */
const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please try again later.'
  }
});

/*
 * Authentication limiter.
 *
 * Successful requests are not counted toward the limit.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many authentication attempts. Please try again later.'
  }
});

/*
 * General write limiter.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'Too many requests. Please slow down.'
  }
});

/*
 * AI limiter.
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'AI usage limit reached. Please try again later.'
  }
});

/*
 * Social-action limiter.
 */
const socialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'Too many social actions. Please slow down.'
  }
});

/*
 * Post-creation limiter.
 *
 * Prevents users from flooding the feed with posts.
 */
const postCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'You are posting too quickly. Please wait a moment.'
  }
});

/*
 * Report limiter.
 *
 * Prevents abuse of the moderation/reporting system.
 */
const reportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'Too many reports. Please try again later.'
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
