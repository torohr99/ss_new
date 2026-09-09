const redis =
  require('./redis');

const LOCK_KEY =
  'sportsmack:background-worker:lock';

const LOCK_TTL_SECONDS = 90;

let lockToken = null;

async function acquireWorkerLock() {
  const token =
    `${process.pid}-${Date.now()}-${Math.random()}`;

  const result =
    await redis.set(
      LOCK_KEY,
      token,
      'EX',
      LOCK_TTL_SECONDS,
      'NX'
    );

  if (result !== 'OK') {
    return false;
  }

  lockToken = token;

  return true;
}

async function renewWorkerLock() {
  if (!lockToken) {
    return false;
  }

  const result =
    await redis.eval(
      `
      if redis.call(
        "get",
        KEYS[1]
      ) == ARGV[1]
      then
        return redis.call(
          "expire",
          KEYS[1],
          ARGV[2]
        )
      else
        return 0
      end
      `,
      1,
      LOCK_KEY,
      lockToken,
      LOCK_TTL_SECONDS
    );

  return result === 1;
}

async function releaseWorkerLock() {
  if (!lockToken) {
    return;
  }

  await redis.eval(
    `
    if redis.call(
      "get",
      KEYS[1]
    ) == ARGV[1]
    then
      return redis.call(
        "del",
        KEYS[1]
      )
    else
      return 0
    end
    `,
    1,
    LOCK_KEY,
    lockToken
  );

  lockToken = null;
}

module.exports = {
  acquireWorkerLock,
  renewWorkerLock,
  releaseWorkerLock
};
