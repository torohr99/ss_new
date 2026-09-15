const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__sportSmackPrisma ||
  new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query'
      },
      {
        emit: 'event',
        level: 'error'
      }
    ]
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__sportSmackPrisma = prisma;
}

// Log only slow SQL queries.
// This avoids flooding Railway logs with every query
// while giving us enough information to identify
// database bottlenecks during Phase 19 load testing.
prisma.$on('query', event => {
  const durationMs = Number(event.duration);

  if (durationMs >= 100) {
    console.warn(
      {
        durationMs,
        query: event.query,
        params: event.params
      },
      'Slow Prisma query'
    );
  }
});

prisma.$on('error', event => {
  console.error(
    {
      message: event.message,
      target: event.target
    },
    'Prisma query error'
  );
});

module.exports = prisma;
