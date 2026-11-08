require('dotenv').config();

const { Emitter } =
  require('@socket.io/redis-emitter');

const Redis =
  require('ioredis');

const {
  acquireWorkerLock,
  renewWorkerLock,
  releaseWorkerLock
} = require('./lib/workerLock');

const liveGameEngine =
  require('./services/liveGameEngine');

const {
  startFantasyScheduler,
  stopFantasyScheduler
} = require('./services/fantasyScheduler');

const {
  processPendingChatReports
} = require('./services/chatModeration');

const prisma =
  require('./lib/prisma');

const redis =
  require('./lib/redis');

const emitterRedis =
  new Redis(process.env.REDIS_URL);

const io =
  new Emitter(emitterRedis);

const workerId =
  process.env.RAILWAY_REPLICA_ID ||
  process.env.RENDER_INSTANCE_ID ||
  `worker-${process.pid}`;

console.log(
  `SportSmack worker ${workerId} starting.`
);

let isShuttingDown = false;
let lockRenewalInterval = null;
let chatModerationInterval = null;
let chatModerationPromise = null;

async function startWorker() {
  /*
   * Make sure Redis is reachable before
   * starting background processing.
   */
  await redis.ping();

  await emitterRedis.ping();

  let acquired = false;
  
  while (!acquired && !isShuttingDown) {
    acquired =
      await acquireWorkerLock();
  
    if (!acquired) {
      console.warn(
        'Another SportSmack background worker is already active. Retrying in 10 seconds...'
      );
  
      await new Promise(resolve =>
        setTimeout(resolve, 10000)
      );
    }
  }
  
  if (isShuttingDown) {
    return;
  }
  
  lockRenewalInterval = setInterval(
    async () => {
      try {
        const renewed =
          await renewWorkerLock();

        if (!renewed) {
          console.error(
            'Lost background-worker Redis lock.'
          );

          await shutdown(
            'WORKER_LOCK_LOST',
            {
              drain: false,
              releaseLock: false,
              exitCode: 1
            }
          );
        }
      } catch (error) {
        console.error(
          'Background-worker lock renewal failed:',
          error.message
        );

        // If lock ownership cannot be verified, stop processing
        // rather than risk two workers running concurrently.
        await shutdown(
          'WORKER_LOCK_RENEWAL_FAILED',
          {
            drain: false,
            releaseLock: false,
            exitCode: 1
          }
        );
      }
    },
    30000
  );
    /*
   * Start the single authoritative live-game
   * processor.
   */
  liveGameEngine.init(io);

  /*
   * Start the single authoritative fantasy
   * scheduler.
   */
  startFantasyScheduler();

  const runChatModeration =
    async () => {
      if (
        isShuttingDown ||
        chatModerationPromise
      ) {
        return chatModerationPromise;
      }

      chatModerationPromise =
        processPendingChatReports(25)
          .catch(error => {
            console.error(
              'Chat moderation worker error:',
              error.message
            );
          })
          .finally(() => {
            chatModerationPromise = null;
          });

      return chatModerationPromise;
    };

  runChatModeration();

  chatModerationInterval = setInterval(
    runChatModeration,
    30 * 1000
  );

  console.log(
    `SportSmack worker ${workerId} started successfully.`
  );
}

async function shutdown(signal, options = {}) {
  const {
    drain = true,
    releaseLock = true,
    exitCode = 0
  } = options;

  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (chatModerationInterval) {
    clearInterval(chatModerationInterval);
    chatModerationInterval = null;
  }

  console.log(
    `Worker ${workerId} received ${signal}.`
  );

  /*
   * On a normal SIGTERM/SIGINT, stop scheduling new work and
   * drain active jobs while this Worker still owns the lock.
   *
   * If lock ownership is lost, do not wait for active jobs:
   * another Worker may already be taking ownership. Stop timers
   * and terminate this process without releasing another owner's lock.
   */
  if (drain) {
    const drainResults = await Promise.allSettled([
      liveGameEngine.stop(),
      stopFantasyScheduler(),
      chatModerationPromise || Promise.resolve()
    ]);

    for (const result of drainResults) {
      if (result.status === 'rejected') {
        console.error(
          'Background job drain failed:',
          result.reason?.message || result.reason
        );
      }
    }
  } else {
    liveGameEngine.stop().catch(error => {
      console.error(
        'Live-game stop error after lock loss:',
        error.message
      );
    });

    stopFantasyScheduler().catch(error => {
      console.error(
        'Fantasy scheduler stop error after lock loss:',
        error.message
      );
    });
  }

  if (lockRenewalInterval) {
    clearInterval(lockRenewalInterval);
    lockRenewalInterval = null;
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error(
      'Prisma shutdown error:',
      error.message
    );
  }

  try {
    await emitterRedis.quit();
  } catch (error) {
    console.error(
      'Socket.IO Redis emitter shutdown error:',
      error.message
    );
  }

  if (releaseLock) {
    try {
      await releaseWorkerLock();
    } catch (error) {
      console.error(
        'Worker lock release error:',
        error.message
      );
    }
  }

  try {
    await redis.quit();
  } catch (error) {
    console.error(
      'Redis shutdown error:',
      error.message
    );
  }

  console.log(
    `SportSmack worker ${workerId} shutdown complete.`
  );

  process.exit(exitCode);
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

startWorker().catch(error => {
  console.error(
    'SportSmack worker failed to start:',
    error
  );

  process.exit(1);
});
