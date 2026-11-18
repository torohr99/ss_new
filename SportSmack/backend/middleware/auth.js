const jwt =
  require('jsonwebtoken');

const logger =
  require('../lib/logger');
const safeErrorMetadata =
  require('../lib/safeErrorMetadata');

const authMiddleware = (req, res, next) => {
  // Get token from cookie
  let token = req.cookies ? req.cookies.smack_auth : null;
  
  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Server authentication configuration error' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn(
      'Token verification failed',
      {
        error: safeErrorMetadata(error)
      }
    );
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = authMiddleware;
