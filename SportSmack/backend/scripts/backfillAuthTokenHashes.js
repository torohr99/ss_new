require('dotenv').config();

const prisma = require('../lib/prisma');
const {
  hashAuthToken,
  isValidAuthToken,
  getVerificationTokenExpiry
} = require('../lib/authTokenSecurity');

const BATCH_SIZE = 100;

async function backfillAuthTokenHashes(client = prisma) {
  let lastId = 0;
  const counts = {
    scanned: 0,
    verificationHashesCreated: 0,
    resetHashesCreated: 0,
    skippedMalformedVerificationTokens: 0,
    skippedMalformedResetTokens: 0,
    concurrentChangesSkipped: 0
  };

  while (true) {
    const users = await client.user.findMany({
      where: {
        id: { gt: lastId },
        OR: [
          {
            verificationToken: { not: null },
            verificationTokenHash: null
          },
          {
            resetPasswordToken: { not: null },
            resetPasswordTokenHash: null
          }
        ]
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        verificationToken: true,
        verificationTokenHash: true,
        verificationTokenExpires: true,
        resetPasswordToken: true,
        resetPasswordTokenHash: true
      }
    });

    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      lastId = user.id;
      counts.scanned += 1;

      const where = { id: user.id };
      const data = {};

      if (user.verificationToken && !user.verificationTokenHash) {
        if (isValidAuthToken(user.verificationToken)) {
          where.verificationToken = user.verificationToken;
          where.verificationTokenHash = null;
          data.verificationTokenHash = hashAuthToken(user.verificationToken);

          // Give pre-migration verification links a single 24-hour
          // grace period from this backfill, without extending tokens
          // that already have an expiry.
          if (!user.verificationTokenExpires) {
            data.verificationTokenExpires = getVerificationTokenExpiry();
          }
        } else {
          counts.skippedMalformedVerificationTokens += 1;
        }
      }

      if (user.resetPasswordToken && !user.resetPasswordTokenHash) {
        if (isValidAuthToken(user.resetPasswordToken)) {
          where.resetPasswordToken = user.resetPasswordToken;
          where.resetPasswordTokenHash = null;
          data.resetPasswordTokenHash = hashAuthToken(user.resetPasswordToken);
          // Preserve resetPasswordExpires exactly as stored. In particular,
          // never revive an expired or expiry-less reset token.
        } else {
          counts.skippedMalformedResetTokens += 1;
        }
      }

      if (Object.keys(data).length === 0) {
        continue;
      }

      const result = await client.user.updateMany({
        where,
        data
      });

      if (result.count === 0) {
        counts.concurrentChangesSkipped += 1;
        continue;
      }

      if (data.verificationTokenHash) {
        counts.verificationHashesCreated += 1;
      }

      if (data.resetPasswordTokenHash) {
        counts.resetHashesCreated += 1;
      }
    }
  }

  return counts;
}

if (require.main === module) {
  backfillAuthTokenHashes()
    .then(counts => {
      console.log('Auth token hash backfill summary:', counts);
      console.log('Legacy plaintext token columns were not cleared by this script.');
      console.log('Run again after the application rollout to catch concurrent legacy writes.');
    })
    .catch(error => {
      console.error('Auth token hash backfill failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { backfillAuthTokenHashes };
