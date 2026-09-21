'use strict';

const redis = require('../lib/redis');

const GEMINI_GLOBAL_SLOT_KEY =
  'ss:ai:gemini:global-slot';

const GEMINI_BACKOFF_KEY =
  'ss:ai:gemini:global-backoff';

/*
 * Maximum normal Gemini request rate across ALL
 * Railway replicas and ALL Gemini-backed features.
 *
 * 15 seconds = at most 4 requests/minute.
 *
 * This intentionally includes:
 * - live AI analysis
 * - live polls
 * - other future Gemini-backed background jobs
 */
const GLOBAL_INTERVAL_SECONDS = 15;

/*
 * After Gemini returns HTTP 429, temporarily stop
 * ALL new Gemini requests.
 *
 * Do not immediately retry because that creates
 * a retry storm across replicas.
 */
const RATE_LIMIT_BACKOFF_SECONDS = 60;

async function acquireSlot() {
  try {
    /*
     * If another request recently received a 429,
     * do not send anything to Gemini yet.
     */
    const backoffActive =
      await redis.exists(
        GEMINI_BACKOFF_KEY
      );

    if (backoffActive) {
      return false;
    }

    /*
     * Redis SET NX EX makes this atomic across
     * every Railway replica.
     */
    const result =
      await redis.set(
        GEMINI_GLOBAL_SLOT_KEY,
        String(Date.now()),
        'EX',
        GLOBAL_INTERVAL_SECONDS,
        'NX'
      );

    return result === 'OK';

  } catch (error) {
    /*
     * Redis is part of the shared coordination layer,
     * but a Redis outage should not take down the
     * entire AI feature set.
     *
     * Fail open rather than crashing requests.
     */
    console.error(
      'Gemini guard Redis error:',
      error.message
    );

    return true;
  }
}

async function recordRateLimit() {
  try {
    await redis.set(
      GEMINI_BACKOFF_KEY,
      String(Date.now()),
      'EX',
      RATE_LIMIT_BACKOFF_SECONDS
    );
  } catch (error) {
    console.error(
      'Gemini backoff Redis error:',
      error.message
    );
  }
}

async function isBackoffActive() {
  try {
    return Boolean(
      await redis.exists(
        GEMINI_BACKOFF_KEY
      )
    );
  } catch (error) {
    console.error(
      'Gemini backoff check Redis error:',
      error.message
    );

    return false;
  }
}

module.exports = {
  acquireSlot,
  recordRateLimit,
  isBackoffActive,
  GLOBAL_INTERVAL_SECONDS,
  RATE_LIMIT_BACKOFF_SECONDS
};
