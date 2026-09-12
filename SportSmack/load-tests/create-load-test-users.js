const bcrypt = require('bcrypt');
const { PrismaClient } = require('../backend/node_modules/@prisma/client');

const prisma = new PrismaClient();

const COUNT = Number(process.env.LOAD_TEST_USER_COUNT || 50);
const PASSWORD = process.env.LOAD_TEST_PASSWORD;

if (!PASSWORD) {
  throw new Error(
    'LOAD_TEST_PASSWORD is required.'
  );
}

if (PASSWORD.length < 8) {
  throw new Error(
    'LOAD_TEST_PASSWORD must be at least 8 characters.'
  );
}

if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 100) {
  throw new Error(
    'LOAD_TEST_USER_COUNT must be an integer between 1 and 100.'
  );
}

async function main() {
  console.log(
    `Creating/updating ${COUNT} dedicated load-test users...`
  );

  const passwordHash = await bcrypt.hash(
    PASSWORD,
    10
  );

  for (let i = 1; i <= COUNT; i++) {
    const suffix = String(i).padStart(2, '0');

    const email =
      `loadtest${suffix}@sportsmack.local`;

    const username =
      `loadtest${suffix}`;

    await prisma.user.upsert({
      where: { email },

      update: {
        username,
        password_hash: passwordHash,
        isVerified: true,
        verificationToken: null,
        role: 'USER'
      },

      create: {
        username,
        email,
        password_hash: passwordHash,
        isVerified: true,
        verificationToken: null,
        role: 'USER'
      }
    });

    console.log(
      `Prepared ${username} (${email})`
    );
  }

  console.log(
    `Successfully prepared ${COUNT} load-test users.`
  );
}

main()
  .catch((error) => {
    console.error(
      'Failed to create load-test users:',
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
