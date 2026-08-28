const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';

// Helper function to generate JWT
const generateToken = (id, username) => {
  return jwt.sign({ id, username }, JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please provide all required fields' });
    }

    // Check if user exists
    const userExists = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Generate Email Verification Token
    const crypto = require('crypto');
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password_hash,
        isVerified: false,
        verificationToken: verificationToken
      }
    });

    // EMAIL DELIVERY
    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
    const verifyLink = `${frontendUrl}/verify?token=${verificationToken}`;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM || '"SportSmack" <noreply@sportsmack.com>',
          to: user.email,
          subject: 'Verify your SportSmack Account',
          text: `Click here to verify your account: ${verifyLink}`,
          html: `<p>Click <a href="${verifyLink}">here</a> to verify your account.</p>`
        });
      } catch (err) {
        console.error('SMTP Error:', err.message);
      }
    } else {
      // MOCK EMAIL DELIVERY FALLBACK
      console.log('\n=============================================');
      console.log('🚀 MOCK EMAIL DELIVERY SYSTEM 🚀');
      console.log(`To: ${user.email}`);
      console.log('Subject: Verify your SportSmack Account');
      console.log(`Body: Click here to verify your account: ${verifyLink}`);
      console.log('=============================================\n');
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for the OTP.',
      userId: user.id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// @route   GET /api/auth/verify/:token
// @desc    Verify user email
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await prisma.user.findFirst({
      where: { verificationToken: token }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationToken: null // Clear token after use
      }
    });

    res.json({ message: 'Account verified successfully. You may now log in.' });
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ message: 'Server error during verification' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate a user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (user && (await bcrypt.compare(password, user.password_hash))) {
      
      if (!user.isVerified) {
        return res.status(403).json({ message: 'Account not verified. Please verify your email first.', unverified: true, userId: user.id });
      }

      // Create token
      const token = generateToken(user.id, user.username);

      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        token
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user / clear cookie
router.post('/logout', (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  res.status(200).json({ message: 'Logged out successfully' });
});

// @route   GET /api/auth/me
// @desc    Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, username: true, email: true, created_at: true, profile_pic: true }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

// @route   POST /api/auth/verify
// @desc    Verify OTP code
router.post('/verify', async (req, res) => {
  try {
    const { userId, code } = req.body;
    
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (user.isVerified) return res.status(400).json({ message: 'User is already verified' });
    
    if (user.otpCode !== code) return res.status(400).json({ message: 'Invalid OTP code' });
    
    // Update user
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true, otpCode: null }
    });
    
    // Generate token
    const token = generateToken(user.id, user.username);
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
