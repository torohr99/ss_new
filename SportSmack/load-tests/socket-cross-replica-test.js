const axios = require('../backend/node_modules/axios');
const { io } = require('../backend/node_modules/socket.io-client');

const BASE_URL = process.env.BASE_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;
const PREFIX = process.env.TEST_EMAIL_PREFIX || 'loadtest';
const PASSWORD = process.env.TEST_PASSWORD;
const LOAD_TEST_SECRET = process.env.LOAD_TEST_SECRET;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!BASE_URL || !FRONTEND_URL || !PASSWORD || !LOAD_TEST_SECRET) {
    throw new Error('Missing required environment variables.');
  }

  console.log('Logging in existing load-test accounts...');

  const users = [];

  for (let i = 1; i <= 25; i++) {
    const email =
      `${PREFIX}${String(i).padStart(2, '0')}@sportsmack.local`;

    const response = await axios.post(
      `${BASE_URL}/api/auth/login`,
      { email, password: PASSWORD },
      {
        headers: {
          'Content-Type': 'application/json',
          Origin: FRONTEND_URL,
          'X-Load-Test-Secret': LOAD_TEST_SECRET,
        },
        timeout: 15000,
      }
    );

    const cookies = response.headers['set-cookie'] || [];
    const authCookie = cookies.find(c => c.startsWith('smack_auth='));

    if (response.status !== 200 || !authCookie) {
      throw new Error(`Authentication failed for ${email}`);
    }

    users.push(authCookie.split(';')[0]);

    await sleep(1000);
  }

  console.log('Authenticated 25 accounts.');
  console.log('Opening sockets and identifying API replicas...');

  const sockets = [];
  const replicaSockets = new Map();

  async function openSocket(index) {
    const socket = io(BASE_URL, {
      autoConnect: false,
      transports: ['websocket'],
      extraHeaders: {
        Cookie: users[index % users.length],
        Origin: FRONTEND_URL,
      },
      reconnection: false,
      timeout: 12000,
    });

    sockets.push(socket);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket connection timed out')),
        15000
      );

      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });

      socket.once('connect_error', error => {
        clearTimeout(timer);
        reject(error);
      });

      socket.connect();
    });

    const info = await new Promise((resolve, reject) => {
      socket.emit('load_test:identify', LOAD_TEST_SECRET, result => {
        if (!result?.success || !result.replicaId) {
          return reject(new Error('Replica identification failed'));
        }

        resolve(result);
      });

      setTimeout(
        () => reject(new Error('Replica identification timed out')),
        5000
      );
    });

    if (!replicaSockets.has(info.replicaId)) {
      replicaSockets.set(info.replicaId, socket);
    }

    console.log(`Connected socket to replica: ${info.replicaId}`);
  }

  try {
    for (let start = 0; start < 40; start += 5) {
      const end = Math.min(start + 5, 40);

      await Promise.all(
        Array.from(
          { length: end - start },
          (_, offset) => openSocket(start + offset)
        )
      );

      await sleep(500);

      if (replicaSockets.size >= 2) {
        break;
      }
    }

    console.log('\n--- REPLICA DISCOVERY ---');
    console.log(`Distinct replicas reached: ${replicaSockets.size}`);

    if (replicaSockets.size < 2) {
      throw new Error(
        'Could not establish sockets on two distinct API replicas.'
      );
    }

    const entries = Array.from(replicaSockets.entries());
    const [replicaA, socketA] = entries[0];
    const [replicaB, socketB] = entries[1];

    console.log(`Sender replica: ${replicaA}`);
    console.log(`Receiver replica: ${replicaB}`);

    const room =
      `sportsmack-load-test-${Date.now()}`;

    const payload = {
      testId: `cross-replica-${Date.now()}`,
      message: 'SportSmack cross-replica delivery test',
    };

    const received = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Message delivery timed out')),
        8000
      );

      socketB.once('load_test:message', message => {
        clearTimeout(timer);
        resolve(message);
      });
    });

    for (const socket of [socketA, socketB]) {
      const result = await new Promise(resolve => {
        socket.emit(
          'load_test:join',
          { secret: LOAD_TEST_SECRET, room },
          resolve
        );
      });

      if (!result?.success) {
        throw new Error('Failed to join test room.');
      }
    }

    console.log('\nBoth sockets joined the test room.');
    console.log('Sending message from the first replica...');

    const broadcastResult = await new Promise(resolve => {
      socketA.emit(
        'load_test:broadcast',
        {
          secret: LOAD_TEST_SECRET,
          room,
          payload,
        },
        resolve
      );
    });

    if (!broadcastResult?.success) {
      throw new Error('Broadcast was rejected.');
    }

    const receivedMessage = await received;

    const passed =
      receivedMessage?.testId === payload.testId &&
      receivedMessage?.message === payload.message;

    console.log('\n--- CROSS-REPLICA RESULTS ---');
    console.log(`Sender replica: ${replicaA}`);
    console.log(`Receiver replica: ${replicaB}`);
    console.log(`Message received: ${passed ? 'YES' : 'NO'}`);

    if (!passed) {
      throw new Error('Received message did not match the sent message.');
    }

    console.log('\nSUCCESS: Redis Socket.IO cross-replica delivery verified.');
  } finally {
    sockets.forEach(socket => socket.disconnect());
    console.log('\nAll diagnostic connections closed.');
  }
}

main().catch(error => {
  console.error('\nCROSS-REPLICA TEST FAILED:', error.message);
  process.exitCode = 1;
});