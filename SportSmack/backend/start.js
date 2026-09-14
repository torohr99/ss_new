const { spawn } =
  require('child_process');

const logger =
  require('./lib/logger');

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

    // If either critical process dies, terminate the
    // container so Railway can restart the service.
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

logger.info(
  'Starting SportSmack API server and background worker...'
);

const server = startProcess(
  'SportSmack API server',
  'server.js'
);

const worker = startProcess(
  'SportSmack worker',
  'worker.js'
);

function shutdown(signal) {
  logger.info(
    `Received ${signal}. Shutting down SportSmack...`
  );

  server.kill('SIGTERM');
  worker.kill('SIGTERM');

  setTimeout(() => {
    process.exit(0);
  }, 5000);
}

process.on('SIGTERM', () =>
  shutdown('SIGTERM')
);

process.on('SIGINT', () =>
  shutdown('SIGINT')
);
