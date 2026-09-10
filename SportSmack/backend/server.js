const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');

const {
  createAdapter
} = require('@socket.io/redis-adapter');

const redis =
  require('./lib/redis');

const helmet = require('helmet');
const {
  standardLimiter,
  authLimiter
} = require('./middleware/rateLimits');
const xss = require('xss-clean');
require('dotenv').config();
const compression = require('compression');
const logger = require('./lib/logger');
const metrics = require('./services/metrics');

const app = express();
const server = http.createServer(app);

// FIX 1: Tell Express to trust Render's proxy headers so express-rate-limit stops crashing
app.set('trust proxy', 1);

// Parse request bodies with strict production limits.
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '1mb'
}));
// Allow connections from localhost (dev) and the deployed Vercel frontend (prod)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://ss-new-backendfromr.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

// Reusable origin verifier for Express and Socket.io
const verifyOrigin = (origin, callback) => {
  // Allow requests with no origin (curl, Postman, server-to-server requests)
  if (!origin) {
    return callback(null, true);
  }

  // Allow explicitly trusted origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(null, true);
  }

  // Allow Vercel preview deployments for this SportSmack project.
  // Vercel generates different preview URLs for deployments,
  // so the exact URL cannot always be known in advance.
  if (
    /^https:\/\/ss-new-backendfromr(?:-[a-z0-9]+)*-sport-smack\.vercel\.app$/i.test(origin)
  ) {
    return callback(null, true);
  }

  logger.warn('Blocked CORS origin', {
    origin
  });
  return callback(null, false);
};

const io = new Server(server, {
  cors: {
    origin: verifyOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const pubClient =
  redis.duplicate();

const subClient =
  redis.duplicate();

pubClient.on('error', error => {
  logger.error(
    'Socket.IO Redis publisher error',
    {
      error
    }
  );
});

subClient.on('error', error => {
  logger.error(
    'Socket.IO Redis subscriber error',
    {
      error
    }
  );
});

io.adapter(
  createAdapter(
    pubClient,
    subClient
  )
);

const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  compression({
    threshold: 1024
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: verifyOrigin,
  credentials: true
}));

app.use(xss()); // Sanitize incoming data to prevent XSS attacks
app.use(cookieParser());

app.use((req, res, next) => {
  res.on('finish', () => {
    metrics.recordRequest(res.statusCode);
  });

  next();
});

app.use('/api', standardLimiter);
app.use('/api/auth', authLimiter);

// Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const usersRoute = require('./routes/users');
const moderationRoute =
  require('./routes/moderation');
const adminModerationRoute =
  require('./routes/adminModeration');
const adminMetricsRoute =
  require('./routes/adminMetrics');
const teamsRoute = require('./routes/teams');
const postsRoute = require('./routes/posts');
const searchRoutes = require('./routes/search');
const sportsRoute = require('./routes/sports');
const fantasyRoute = require('./routes/fantasy');
const aiRoute = require('./routes/ai');
const gamecastRoute = require('./routes/gamecast');
app.use('/api', indexRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoute);
app.use(
  '/api/moderation',
  moderationRoute
);
app.use(
  '/api/admin/moderation',
  adminModerationRoute
);
app.use(
  '/api/admin/metrics',
  adminMetricsRoute
);
app.use('/api/teams', teamsRoute);
app.use('/api/posts', postsRoute);
app.use('/api/search', searchRoutes);
app.use('/api/sports', sportsRoute);
app.use('/api/fantasy', fantasyRoute);
app.use('/api/ai', aiRoute);
app.use('/api/gamecast', gamecastRoute);

// Health check endpoint
const prisma = require('./lib/prisma');

app.get('/health', (req, res) => {
  return res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    await redis.ping();

    return res.status(200).json({
      status: 'OK',
      database: 'OK',
      redis: 'OK',
      instance:
        process.env.RENDER_INSTANCE_ID ||
        'local',
      timestamp:
        new Date().toISOString(),
      uptime:
        Math.round(process.uptime())
    });
  } catch (error) {
    logger.error(
      'Health check failed',
      {
        error
      }
    );

    return res.status(503).json({
      status: 'ERROR',
      database: 'ERROR',
      redis: 'ERROR',
      instance:
        process.env.RENDER_INSTANCE_ID ||
        'local',
      timestamp:
        new Date().toISOString()
    });
  }
});

// 404 handler — MUST come after all routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Centralized error handler — MUST be last
app.use((err, req, res, next) => {
  logger.error('Unhandled server error', {
    error: err
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
  });
});

// Socket.io Handlers
const setupChatSockets = require('./sockets/chatHandler');
const setupFantasySockets = require('./sockets/fantasyHandler');
setupChatSockets(io);
setupFantasySockets(io);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  logger.info('SportSmack backend started', {
    port: PORT,
    environment:
      process.env.NODE_ENV || 'development'
  });
});

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  logger.info(
    'Starting graceful shutdown',
    {
      signal
    }
  );

  io.close(() => {
    logger.info(
      'Socket.IO connections closed.'
    );
  });

  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.error(
        'Prisma shutdown error',
        {
          error
        }
      );
    }

    try {
      await redis.quit();
    } catch (error) {
      logger.error(
        'Redis shutdown error',
        {
          error
        }
      );
    }

    logger.info(
      'SportSmack backend shutdown complete.'
    );

    process.exit(0);
  });

  setTimeout(() => {
    logger.error(
      'Graceful shutdown timed out.'
    );

    process.exit(1);
  }, 25000).unref();
}

process.on(
  'SIGTERM',
  () => gracefulShutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => gracefulShutdown('SIGINT')
);
