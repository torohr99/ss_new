require('dotenv').config();

const liveGameEngine =
  require('./services/liveGameEngine');

const {
  stopFantasyScheduler
} = require('./services/fantasyScheduler');

const prisma =
  require('./lib/prisma');

const redis =
  require('./lib/redis');

const workerId =
  process.env.RENDER_INSTANCE_ID ||
  `worker-${process.pid}`;

console.log(
  `SportSmack worker ${workerId} starting.`
);

const fakeIo = {
  to(roomId) {
    return {
      emit(event, payload) {
        console.log(
          `Worker emitted ${event} to ${roomId}`
        );
      }
    };
  }
};

liveGameEngine.init(fakeIo);

const shutdown = async signal => {
  console.log(
    `Worker received ${signal}.`
  );

  liveGameEngine.stop();
  stopFantasyScheduler();

  await prisma.$disconnect();

  try {
    await redis.quit();
  } catch (error) {
    console.error(
      'Redis shutdown error:',
      error.message
    );
  }

  process.exit(0);
};

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
