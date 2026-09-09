require('dotenv').config();

const { Emitter } =
  require('@socket.io/redis-emitter');

const Redis =
  require('ioredis');

const liveGameEngine =
  require('./services/liveGameEngine');

const {
  startFantasyScheduler,
  stopFantasyScheduler
} = require('./services/fantasyScheduler');

const prisma =
  require('./lib/prisma');

const redis =
  require('./lib/redis');

const emitterRedis =
  new Redis(process.env.REDIS_URL);

const io =
  new Emitter(emitterRedis);

const workerId =
  process.env.RENDER_INSTANCE_ID ||
  `worker-${process.pid}`;

console.log(
  `SportSmack worker ${workerId} starting.`
);

let isShuttingDown = false;

async function startWorker() {
  /*
   * Make sure Redis is reachable before
   * starting background processing.
   */
  await redis.ping();

  await emitterRedis.ping();

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

  console.log(
    `SportSmack worker ${workerId} started successfully.`
  );
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `Worker ${workerId} received ${signal}.`
  );

  /*
   * Stop all background timers first.
   */
  liveGameEngine.stop();
  stopFantasyScheduler();

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

  process.exit(0);
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
