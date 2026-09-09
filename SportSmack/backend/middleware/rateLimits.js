const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

/*
 * Generate a safe rate-limit key.
 *
 * Authenticated users are limited by their SportSmack user ID.
 * Unauthenticated requests are limited by a normalized IP address.
 *
 * ipKeyGenerator() is required by express-rate-limit v8 for IPv6
 * addresses so users cannot bypass limits by rotating IPv6 addresses.
 */
function userOrIpKeyGenerator(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  return `ip:${ipKeyGenerator(req.ip)}`;
}

/*
 * General read limiter.
 *
 * Used for endpoints where we want to prevent excessive requests
 * without being overly restrictive.
 */
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'Too many requests. Please try again later.'
  }
});

/*
 * General write limiter.
 *
 * Applies to authenticated write operations such as likes,
 * comments, follows, etc.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKeyGenerator,
  message: {
    error: 'Too many actions. Please slow down.'
  }
});

/*
 * Social-action limiter.
 *
 * Used for social interactions such as comments, likes,
 * blocking, reporting, and similar actions.
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
 * More restrictive than the general write limiter to prevent
 * users from flooding the social feed with posts.
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
 * Reports are deliberately limited over a longer period to
 * prevent abuse of the moderation system.
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
  readLimiter,
  writeLimiter,
  socialLimiter,
  postCreationLimiter,
  reportLimiter
};
