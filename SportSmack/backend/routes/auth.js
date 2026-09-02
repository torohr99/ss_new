const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not configured');
}

// ------------------------------------------------------------
// JWT
// ------------------------------------------------------------

const generateToken = (id, username) => {
  return jwt.sign(
    { id, username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// ------------------------------------------------------------
// EMAIL VERIFICATION
// ------------------------------------------------------------

const sendVerificationEmail = async (email, verificationToken) => {
  const requiredVariables = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'FRONTEND_URL'
  ];

  const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required email environment variables: ${missingVariables.join(', ')}`
    );
  }

  const frontendUrl = process.env.FRONTEND_URL.replace(/\/$/, '');

  const verifyLink =
    `${frontendUrl}/verify?token=${encodeURIComponent(verificationToken)}`;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  // Verify SMTP connection before attempting to send.
  await transporter.verify();

  const info = await transporter.sendMail({
    from: `"SportSmack" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: 'Verify your SportSmack account',
    text:
      `Welcome to SportSmack!\n\n` +
      `Please verify your email address by clicking this link:\n\n` +
      `${verifyLink}\n\n` +
      `If you did not create a SportSmack account, you can ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to SportSmack!</h2>

        <p>
          Thanks for creating a SportSmack account.
          Please verify your email address by clicking the button below.
        </p>

        <p style="margin: 30px 0;">
          <a
            href="${verifyLink}"
            style="
              display: inline-block;
              padding: 12px 24px;
              background-color: #2563eb;
              color: #ffffff;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
            "
          >
            Verify My Email
          </a>
        </p>

        <p>
          Or copy and paste this link into your browser:
        </p>

        <p style="word-break: break-all;">
          ${verifyLink}
        </p>

        <p>
          If you did not create a SportSmack account, you can ignore this email.
        </p>
      </div>
    `
  });

  console.log(
    `Verification email sent successfully to ${email}. Message ID: ${info.messageId}`
  );

  return info;
};

// ------------------------------------------------------------
// REGISTER
// ------------------------------------------------------------

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    let { username, email, password } = req.body;

    username =
      typeof username === 'string'
        ? username.trim()
        : '';

    email =
      typeof email === 'string'
        ? email.trim().toLowerCase()
        : '';

    password =
      typeof password === 'string'
        ? password
        : '';

    if (!username || !email || !password) {
      return res.status(400).json({
        message:
          'Please provide a username, email, and password.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters long.'
      });
    }

    // Check for an existing email or username.
    const userExists = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    });

    if (userExists) {
      if (userExists.email === email) {
        return res.status(400).json({
          message:
            'An account with this email address already exists.'
        });
      }

      return res.status(400).json({
        message:
          'That username is already taken.'
      });
    }

    // Hash password.
    const salt = await bcrypt.genSalt(10);
    const password_hash =
      await bcrypt.hash(password, salt);

    // Generate a cryptographically secure token.
    const verificationToken =
      crypto.randomBytes(32).toString('hex');

    // Create account as UNVERIFIED.
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash,
        isVerified: false,
        verificationToken
      }
    });

    try {
      // Send verification email.
      await sendVerificationEmail(
        user.email,
        verificationToken
      );
    } catch (emailError) {
      console.error(
        'EMAIL VERIFICATION ERROR:',
        emailError
      );

      // Remove the account if the verification email could
      // not be sent. This prevents an unusable account from
      // occupying the email address.
      try {
        await prisma.user.delete({
          where: {
            id: user.id
          }
        });
      } catch (deleteError) {
        console.error(
          'Failed to delete user after email failure:',
          deleteError
        );
      }

      return res.status(500).json({
        message:
          'We could not send the verification email. Please try again later.'
      });
    }

    return res.status(201).json({
      success: true,
      message:
        'Account created successfully. Please check your email and click the verification link before logging in.'
    });

  } catch (error) {
    console.error(
      'Registration error:',
      error
    );

    // Protect against simultaneous duplicate registrations
    // despite the application-level check above.
    if (error.code === 'P2002') {
      return res.status(400).json({
        message:
          'An account with that email or username already exists.'
      });
    }

    return res.status(500).json({
      message:
        'Server error during registration.'
    });
  }
});

// ------------------------------------------------------------
// VERIFY EMAIL
// ------------------------------------------------------------

// GET /api/auth/verify/:token
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token || token.length !== 64) {
      return res.status(400).json({
        message:
          'Invalid verification link.'
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token
      }
    });

    if (!user) {
      return res.status(400).json({
        message:
          'This verification link is invalid or has already been used.'
      });
    }

    if (user.isVerified) {
      return res.json({
        success: true,
        message:
          'Your email is already verified.'
      });
    }

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        isVerified: true,
        verificationToken: null
      }
    });

    return res.json({
      success: true,
      message:
        'Your email has been verified successfully. You may now log in.'
    });

  } catch (error) {
    console.error(
      'Email verification error:',
      error
    );

    return res.status(500).json({
      message:
        'Server error during email verification.'
    });
  }
});

// ------------------------------------------------------------
// LOGIN
// ------------------------------------------------------------

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    email =
      typeof email === 'string'
        ? email.trim().toLowerCase()
        : '';

    password =
      typeof password === 'string'
        ? password
        : '';

    const user = await prisma.user.findUnique({
      where: {
        email
      }
    });

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {
      return res.status(401).json({
        message:
          'Invalid email or password.'
      });
    }

    // IMPORTANT:
    // Users must verify their email before they can log in.
    if (!user.isVerified) {
      return res.status(403).json({
        message:
          'Please verify your email address before logging in. Check your inbox for the verification email.',
        unverified: true
      });
    }

    const token =
      generateToken(
        user.id,
        user.username
      );

    return res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      token
    });

  } catch (error) {
    console.error(
      'Login error:',
      error
    );

    return res.status(500).json({
      message:
        'Server error during login.'
    });
  }
});

// ------------------------------------------------------------
// LOGOUT
// ------------------------------------------------------------

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });

  return res.status(200).json({
    message:
      'Logged out successfully'
  });
});

// ------------------------------------------------------------
// CURRENT USER
// ------------------------------------------------------------

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id
        },
        select: {
          id: true,
          username: true,
          email: true,
          created_at: true,
          profile_pic: true,
          isVerified: true
        }
      });

    if (!user) {
      return res.status(404).json({
        message:
          'User not found'
      });
    }

    return res.json(user);

  } catch (error) {
    console.error(
      'Current-user error:',
      error
    );

    return res.status(500).json({
      message:
        'Server error fetching profile.'
    });
  }
});

module.exports = router;
