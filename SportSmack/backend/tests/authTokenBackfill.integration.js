const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const prisma = require('../lib/prisma');
const { backfillAuthTokenHashes } = require('../scripts/backfillAuthTokenHashes');
const { hashAuthToken, VERIFICATION_TOKEN_TTL_MS } = require('../lib/authTokenSecurity');

test('PostgreSQL backfill hashes legacy tokens, preserves reset expiry, and is idempotent', async () => {
  const suffix = crypto.randomUUID();
  const verificationToken = crypto.randomBytes(32).toString('hex');
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetExpiry = new Date(Date.now() + 15 * 60 * 1000);
  const createdIds = [];

  try {
    const verificationUser = await prisma.user.create({
      data: {
        username: 'phase2112-verify-' + suffix,
        email: 'phase2112-verify-' + suffix + '@example.test',
        password_hash: 'test-password-hash',
        isVerified: false,
        verificationToken
      }
    });
    createdIds.push(verificationUser.id);

    const resetUser = await prisma.user.create({
      data: {
        username: 'phase2112-reset-' + suffix,
        email: 'phase2112-reset-' + suffix + '@example.test',
        password_hash: 'test-password-hash',
        isVerified: true,
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetExpiry
      }
    });
    createdIds.push(resetUser.id);

    const startedAt = Date.now();
    const counts = await backfillAuthTokenHashes(prisma);
    const finishedAt = Date.now();

    assert.equal(counts.scanned, 2);
    assert.equal(counts.verificationHashesCreated, 1);
    assert.equal(counts.resetHashesCreated, 1);
    assert.equal(counts.concurrentChangesSkipped, 0);

    const updatedVerificationUser = await prisma.user.findUnique({
      where: { id: verificationUser.id }
    });
    assert.equal(
      updatedVerificationUser.verificationTokenHash,
      hashAuthToken(verificationToken)
    );
    assert.equal(updatedVerificationUser.verificationToken, verificationToken);
    assert.ok(updatedVerificationUser.verificationTokenExpires instanceof Date);
    assert.ok(
      updatedVerificationUser.verificationTokenExpires.getTime() >=
        startedAt + VERIFICATION_TOKEN_TTL_MS
    );
    assert.ok(
      updatedVerificationUser.verificationTokenExpires.getTime() <=
        finishedAt + VERIFICATION_TOKEN_TTL_MS + 1000
    );

    const updatedResetUser = await prisma.user.findUnique({
      where: { id: resetUser.id }
    });
    assert.equal(updatedResetUser.resetPasswordTokenHash, hashAuthToken(resetToken));
    assert.equal(updatedResetUser.resetPasswordToken, resetToken);
    assert.equal(
      updatedResetUser.resetPasswordExpires.getTime(),
      resetExpiry.getTime()
    );

    const secondRun = await backfillAuthTokenHashes(prisma);
    assert.equal(secondRun.scanned, 0);
    assert.equal(secondRun.verificationHashesCreated, 0);
    assert.equal(secondRun.resetHashesCreated, 0);
  } finally {
    if (createdIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdIds } }
      });
    }
  }
});
