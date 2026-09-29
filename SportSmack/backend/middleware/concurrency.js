const redis =
  require('../lib/redis');

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1]
  then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

function createConcurrencyLimiter({
  maxConcurrent = 4,
  maxQueued = 8,
  keyPrefix = 'global'
} = {}) {
  const queueKey =
    `sportSmack:concurrency:${keyPrefix}:queue`;

  const slotPrefix =
    `sportSmack:concurrency:${keyPrefix}:slot:`;

  return async function concurrencyLimiter(
    req,
    res,
    next
  ) {
    let queued = false;
    let acquiredSlot = null;

    try {
      const queueCount =
        await redis.incr(queueKey);

      if (queueCount > maxQueued) {
        await redis.decr(queueKey);

        return res.status(429).json({
          success: false,
          code: 'SERVER_BUSY',
          message:
            'This service is temporarily busy. Please try again shortly.'
        });
      }

      queued = true;

      const startedAt =
        Date.now();

      const maxWaitMs =
        10000;

      const retryDelayMs =
        100;

      const slotTtlMs =
        45000;

      while (
        Date.now() - startedAt <
        maxWaitMs
      ) {
        for (
          let slot = 0;
          slot < maxConcurrent;
          slot++
        ) {
          const slotKey =
            `${slotPrefix}${slot}`;

          const token =
            `${process.pid}-${Date.now()}-${Math.random()}`;

          const result =
            await redis.set(
              slotKey,
              token,
              'PX',
              slotTtlMs,
              'NX'
            );

          if (result === 'OK') {
            acquiredSlot = {
              slotKey,
              token
            };

            break;
          }
        }

        if (acquiredSlot) {
          break;
        }

        await new Promise(resolve =>
          setTimeout(
            resolve,
            retryDelayMs
          )
        );
      }

      if (!acquiredSlot) {
        return res.status(429).json({
          success: false,
          code: 'SERVER_BUSY',
          message:
            'AI capacity is temporarily full. Please try again shortly.'
        });
      }

      await redis.decr(queueKey);
      queued = false;

      let released = false;

      const release = async () => {
        if (released) {
          return;
        }

        released = true;

        if (!acquiredSlot) {
          return;
        }

        try {
          await redis.eval(
            RELEASE_LOCK_SCRIPT,
            1,
            acquiredSlot.slotKey,
            acquiredSlot.token
          );
        } catch (error) {
          console.error(
            'Distributed concurrency release failed:',
            error.message
          );
        }
      };

      res.on(
        'finish',
        release
      );

      res.on(
        'close',
        release
      );

      return next();

    } catch (error) {
      if (queued) {
        try {
          await redis.decr(queueKey);
        } catch (_) {
          // Redis failure is already being handled below.
        }
      }

      if (acquiredSlot) {
        try {
          await redis.eval(
            RELEASE_LOCK_SCRIPT,
            1,
            acquiredSlot.slotKey,
            acquiredSlot.token
          );
        } catch (_) {
          // Slot TTL provides eventual recovery.
        }
      }

      console.error(
        'Distributed concurrency limiter failed:',
        error.message
      );

      return res.status(503).json({
        success: false,
        code: 'CONCURRENCY_SERVICE_UNAVAILABLE',
        message:
          'This service is temporarily unavailable. Please try again shortly.'
      });
    }
  };
}

const aiConcurrencyLimiter =
  createConcurrencyLimiter({
    maxConcurrent: 4,
    maxQueued: 8,
    keyPrefix: 'ai'
  });

module.exports = {
  createConcurrencyLimiter,
  aiConcurrencyLimiter
};
