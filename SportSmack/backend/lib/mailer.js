const nodemailer = require('nodemailer');

const requiredVariables = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM'
];

const missingVariables =
  requiredVariables.filter(
    variable => !process.env[variable]
  );

if (missingVariables.length > 0) {
  throw new Error(
    `Missing required email environment variables: ${missingVariables.join(', ')}`
  );
}

const transporter =
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(
      process.env.SMTP_PORT || 587
    ),
    secure:
      process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100
  });

module.exports = transporter;
