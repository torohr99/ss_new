const { spawn } =
  require('child_process');

const logger =
  require('./lib/logger');

function envFlag(name, defaultValue = true) {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  return ![
    'false',
    '0',
    'no',
    'off'
  ].includes(
    String(value).toLowerCase()
  );
}

function startProcess(name, script) {
  const child = spawn(
    process.execPath,
    [script],
    {
      stdio: 'inherit',
      env: process.env
    }
  );

  child.on('exit', (code, signal) => {
    logger.error(
      `${name} exited`,
      {
        code,
        signal
      }
    );

    process.exit(
      typeof code === 'number'
        ? code
        : 1
    );
  });

  child.on('error', error => {
    logger.error(
      `${name} failed to start`,
      {
        error
      }
    );

    process.exit(1);
  });

  return child;
}

const startApi =
  envFlag('START_API', true);

const startWorker =
  envFlag('START_WORKER', true);

if (!startApi && !startWorker) {
  throw new Error(
    'START_API and START_WORKER cannot both be false.'
  );
}

logger.info(
  'Starting SportSmack services',
  {
    startApi,
    startWorker
  }
);

const server =
  startApi
    ? startProcess(
        'SportSmack API server',
        'server.js'
      )
    : null;

const worker =
  startWorker
    ? startProcess(
        'SportSmack worker',
        'worker.js'
      )
    : null;

function shutdown(signal) {
  logger.info(
    `Received ${signal}. Shutting down SportSmack...`
  );

  if (server) {
    server.kill('SIGTERM');
  }

  if (worker) {
    worker.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
