const winston = require('winston');

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isProduction = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProduction
    ? combine(
        timestamp(),
        errors({ stack: true }),
        json()
      )
    : combine(
        colorize(),
        timestamp(),
        errors({ stack: true }),
        simple()
      ),
  transports: [
    new winston.transports.Console()
  ],
  exitOnError: false
});

module.exports = logger;
