const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const liveGameEngine = require('./services/liveGameEngine');
const {
  standardLimiter,
  authLimiter
} = require('./middleware/rateLimits');
const xss = require('xss-clean');
require('dotenv').config();
const {
  startFantasyScheduler
} = require('./services/fantasyScheduler');
const compression = require('compression');

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

// FIX 2 & 3: Reusable origin verifier for both Express and Socket.io that handles Vercel Wildcards
const verifyOrigin = (origin, callback) => {
  // Allow requests with no origin (like mobile apps, postman, curl)
  if (!origin) return callback(null, true);
  
  // Check exact matches
  if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  
  // Wildcard check for any Vercel deployment under this project name
  // Production should use only explicitly trusted origins.
  if (
    process.env.NODE_ENV !== 'production' &&
    /^https:\/\/ss-new-backendfromr.*\.vercel\.app$/.test(origin)
  ) {
    return callback(null, true);
  }
  
  console.error(`Blocked CORS Origin: ${origin}`);
  return callback(null, false);
};

const io = new Server(server, {
  cors: {
    origin: verifyOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

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

app.use('/api', standardLimiter);
app.use('/api/auth', authLimiter);

// Routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const usersRoute = require('./routes/users');
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
app.use('/api/teams', teamsRoute);
app.use('/api/posts', postsRoute);
app.use('/api/search', searchRoutes);
app.use('/api/sports', sportsRoute);
app.use('/api/fantasy', fantasyRoute);
app.use('/api/ai', aiRoute);
app.use('/api/gamecast', gamecastRoute);

// Health check endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SportSmack Backend is running'
  });
});

// 404 handler — MUST come after all routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Centralized error handler — MUST be last
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);

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

// Initialize Live Game Engine for dynamic polls
liveGameEngine.init(io);

startFantasyScheduler();

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
