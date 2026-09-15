function createConcurrencyLimiter({
  maxConcurrent = 4,
  maxQueued = 8
} = {}) {
  let active = 0;
  const queue = [];

  return function concurrencyLimiter(
    req,
    res,
    next
  ) {
    if (
      active >= maxConcurrent &&
      queue.length >= maxQueued
    ) {
      return res.status(429).json({
        success: false,
        code: 'SERVER_BUSY',
        message:
          'This service is temporarily busy. Please try again shortly.'
      });
    }

    const run = () => {
      active += 1;

      let finished = false;

      const finish = () => {
        if (finished) {
          return;
        }

        finished = true;
        active -= 1;

        const nextRequest =
          queue.shift();

        if (nextRequest) {
          nextRequest();
        }
      };

      res.on('finish', finish);
      res.on('close', finish);

      next();
    };

    if (active < maxConcurrent) {
      run();
      return;
    }

    queue.push(run);
  };
}

const aiConcurrencyLimiter =
  createConcurrencyLimiter({
    maxConcurrent: 4,
    maxQueued: 8
  });

module.exports = {
  createConcurrencyLimiter,
  aiConcurrencyLimiter
};
