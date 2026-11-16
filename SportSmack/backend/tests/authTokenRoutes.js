const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-thirty-two-bytes';
process.env.RESEND_API_KEY = 'test-only-resend-key';
process.env.FRONTEND_URL = 'https://frontend.example.test';

const users = [];
let nextId = 1;

function matchesWhere(user, where) {
  for (const [key, expected] of Object.entries(where || {})) {
    if (key === 'OR') {
      if (!expected.some(condition => matchesWhere(user, condition))) return false;
      continue;
    }

    if (key === 'AND') {
      if (!expected.every(condition => matchesWhere(user, condition))) return false;
      continue;
    }

    const actual = user[key];

    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if (Object.prototype.hasOwnProperty.call(expected, 'gt')) {
        if (!(actual instanceof Date) || actual <= expected.gt) return false;
        continue;
      }
    }

    if (expected === null) {
      if (actual !== null && actual !== undefined) return false;
    } else if (actual !== expected) {
      return false;
    }
  }

  return true;
}

const prismaMock = {
  user: {
    async findFirst({ where }) {
      return users.find(user => matchesWhere(user, where)) || null;
    },
    async findUnique({ where }) {
      return users.find(user => matchesWhere(user, where)) || null;
    },
    async updateMany({ where, data }) {
      const user = users.find(candidate => matchesWhere(candidate, where));
      if (!user) return { count: 0 };
      Object.assign(user, data);
      return { count: 1 };
    },
    async update({ where, data }) {
      const user = users.find(candidate => matchesWhere(candidate, where));
      if (!user) throw new Error('Record not found');
      Object.assign(user, data);
      return user;
    },
    async create({ data }) {
      const user = { id: nextId++, ...data };
      users.push(user);
      return user;
    },
    async delete({ where }) {
      const index = users.findIndex(candidate => matchesWhere(candidate, where));
      if (index < 0) throw new Error('Record not found');
      return users.splice(index, 1)[0];
    }
  }
};

const prismaPath = require.resolve('../lib/prisma');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prismaMock
};

const mailerPath = require.resolve('../lib/mailer');
require.cache[mailerPath] = {
  id: mailerPath,
  filename: mailerPath,
  loaded: true,
  exports: {
    async sendMail() {
      return { messageId: 'test-message-id' };
    }
  }
};

const {
  generateAuthToken,
  hashAuthToken,
  getVerificationTokenExpiry,
  getResetTokenExpiry
} = require('../lib/authTokenSecurity');

const authRoutes = require('../routes/auth');
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const server = http.createServer(app);
let baseUrl;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test.beforeEach(() => {
  users.length = 0;
  nextId = 1;
});

function addUser(overrides = {}) {
  const user = {
    id: nextId++,
    username: 'test-user',
    email: 'test@example.com',
    password_hash: 'old-password-hash',
    isVerified: false,
    verificationToken: null,
    verificationTokenHash: null,
    verificationTokenExpires: null,
    resetPasswordToken: null,
    resetPasswordTokenHash: null,
    resetPasswordExpires: null,
    ...overrides
  };
  users.push(user);
  return user;
}

async function post(path, body) {
  return fetch(baseUrl + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('resend verification uses a generic response and issues a fresh expiring token', async () => {
  const user = addUser({
    email: 'resend@example.com',
    verificationToken: 'b'.repeat(64)
  });

  const response = await post('/api/auth/resend-verification', {
    email: ' RESEND@example.com '
  });

  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /If an unverified account exists/);
  assert.equal(user.verificationToken.length, 64);
  assert.match(user.verificationTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(user.verificationTokenHash, user.verificationToken);
  assert.ok(user.verificationTokenExpires instanceof Date);
  assert.ok(user.verificationTokenExpires > new Date());
});

test('resend verification does not reveal whether an email is registered or verified', async () => {
  const missing = await post('/api/auth/resend-verification', {
    email: 'missing@example.com'
  });
  const missingBody = await missing.json();

  addUser({
    email: 'verified@example.com',
    isVerified: true
  });
  const verified = await post('/api/auth/resend-verification', {
    email: 'verified@example.com'
  });
  const verifiedBody = await verified.json();

  assert.equal(missing.status, 200);
  assert.equal(verified.status, 200);
  assert.deepEqual(missingBody, verifiedBody);
});

test('verification accepts a valid hash-only token and clears all verification token fields', async () => {
  const token = generateAuthToken();
  const user = addUser({
    verificationTokenHash: hashAuthToken(token),
    verificationTokenExpires: getVerificationTokenExpiry()
  });

  const response = await post('/api/auth/verify/' + token, {});
  assert.equal(response.status, 200);
  assert.equal(user.isVerified, true);
  assert.equal(user.verificationToken, null);
  assert.equal(user.verificationTokenHash, null);
  assert.equal(user.verificationTokenExpires, null);
});

test('verification accepts a legacy plaintext token during the compatibility window', async () => {
  const token = generateAuthToken();
  const user = addUser({
    verificationToken: token,
    verificationTokenExpires: null
  });

  const response = await post('/api/auth/verify/' + token, {});
  assert.equal(response.status, 200);
  assert.equal(user.isVerified, true);
  assert.equal(user.verificationToken, null);
});

test('verification rejects expired tokens', async () => {
  const token = generateAuthToken();
  addUser({
    verificationTokenHash: hashAuthToken(token),
    verificationTokenExpires: new Date(Date.now() - 1000)
  });

  const response = await post('/api/auth/verify/' + token, {});
  assert.equal(response.status, 400);
});

test('verification rejects malformed tokens before database lookup', async () => {
  const response = await post('/api/auth/verify/not-a-token', {});
  assert.equal(response.status, 400);
});

test('verification token is single-use under concurrent requests', async () => {
  const token = generateAuthToken();
  addUser({
    verificationTokenHash: hashAuthToken(token),
    verificationTokenExpires: getVerificationTokenExpiry()
  });

  const responses = await Promise.all([
    post('/api/auth/verify/' + token, {}),
    post('/api/auth/verify/' + token, {})
  ]);

  assert.deepEqual(
    responses.map(response => response.status).sort(),
    [200, 400]
  );
});

test('password reset accepts a valid hash-only token and clears token fields', async () => {
  const token = generateAuthToken();
  const user = addUser({
    resetPasswordTokenHash: hashAuthToken(token),
    resetPasswordExpires: getResetTokenExpiry()
  });

  const response = await post('/api/auth/reset-password', {
    token,
    password: 'new-secure-password'
  });

  assert.equal(response.status, 200);
  assert.notEqual(user.password_hash, 'old-password-hash');
  assert.equal(user.resetPasswordToken, null);
  assert.equal(user.resetPasswordTokenHash, null);
  assert.equal(user.resetPasswordExpires, null);
});

test('password reset retains compatibility with an unexpired legacy plaintext token', async () => {
  const token = generateAuthToken();
  const user = addUser({
    resetPasswordToken: token,
    resetPasswordExpires: getResetTokenExpiry()
  });

  const response = await post('/api/auth/reset-password', {
    token,
    password: 'new-secure-password'
  });

  assert.equal(response.status, 200);
  assert.notEqual(user.password_hash, 'old-password-hash');
  assert.equal(user.resetPasswordToken, null);
});

test('password reset rejects expired tokens', async () => {
  const token = generateAuthToken();
  addUser({
    resetPasswordTokenHash: hashAuthToken(token),
    resetPasswordExpires: new Date(Date.now() - 1000)
  });

  const response = await post('/api/auth/reset-password', {
    token,
    password: 'new-secure-password'
  });

  assert.equal(response.status, 400);
});

test('password reset rejects malformed tokens', async () => {
  const response = await post('/api/auth/reset-password', {
    token: 'bad-token',
    password: 'new-secure-password'
  });
  assert.equal(response.status, 400);
});

test('password reset token is single-use under concurrent requests', async () => {
  const token = generateAuthToken();
  addUser({
    resetPasswordTokenHash: hashAuthToken(token),
    resetPasswordExpires: getResetTokenExpiry()
  });

  const responses = await Promise.all([
    post('/api/auth/reset-password', {
      token,
      password: 'first-new-password'
    }),
    post('/api/auth/reset-password', {
      token,
      password: 'second-new-password'
    })
  ]);

  assert.deepEqual(
    responses.map(response => response.status).sort(),
    [200, 400]
  );
});
