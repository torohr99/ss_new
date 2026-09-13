const { spawn } = require('child_process');

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
    console.error(
      `${name} exited. code=${code} signal=${signal}`
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
    console.error(
      `${name} failed to start:`,
      error
    );

    process.exit(1);
  });

  return child;
}

console.log(
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
  console.log(
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
