const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const liveGameEngine = require('./services/liveGameEngine');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
// Allow connections from localhost (dev) and the deployed Vercel frontend (prod)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://ss-new-backendfromr-pl6vf0k56-sport-smack.vercel.app',
  'https://ss-new-backendfromr.vercel.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error(`CORS: Origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    console.error(`Blocked CORS Origin: ${origin}`);

    return callback(null, false);
  },
  credentials: true
}));
app.options('*', cors());
app.use(express.json());
app.use(xss()); // Sanitize incoming data to prevent XSS attacks
app.use(cookieParser());

// Rate Limiting (DDoS & Brute Force protection)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // Limit each IP to 50 login/register requests per window
  message: 'Too many authentication attempts, please try again later.'
});
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
  res.json({ status: 'OK', message: 'SportSmack Backend is running' });
});

// Socket.io Handlers
const setupChatSockets = require('./sockets/chatHandler');
const setupFantasySockets = require('./sockets/fantasyHandler');
setupChatSockets(io);
setupFantasySockets(io);

// Initialize Live Game Engine for dynamic polls
liveGameEngine.init(io);

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
