const { spawn } = require('child_process');

const logger = require('./lib/logger');
const superviseChildren = require('./lib/processSupervisor');

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
  ].includes(String(value).toLowerCase());
}

const startApi = envFlag('START_API', true);
const startWorker = envFlag('START_WORKER', true);

if (!startApi && !startWorker) {
  throw new Error('START_API and START_WORKER cannot both be false.');
}

logger.info('Starting SportSmack services', {
  startApi,
  startWorker
});

const children = [];

function startProcess(name, script) {
  const child = spawn(
    process.execPath,
    [script],
    {
      stdio: 'inherit',
      env: process.env
    }
  );

  children.push({ name, child });
}

try {
  if (startApi) {
    startProcess('SportSmack API server', 'server.js');
  }

  if (startWorker) {
    startProcess('SportSmack worker', 'worker.js');
  }
} catch (error) {
  logger.error('Failed to start a SportSmack child process.', { error });

  for (const { child } of children) {
    try {
      child.kill('SIGTERM');
    } catch (killError) {
      logger.error('Failed to stop a partially started child process.', {
        error: killError
      });
    }
  }

  process.exitCode = 1;
}

if (children.length > 0) {
  superviseChildren({
    children,
    logger,
    // The API has a 25-second internal shutdown deadline; keep the parent
    // alive slightly longer before escalating children to SIGKILL.
    gracePeriodMs: Number(process.env.SUPERVISOR_SHUTDOWN_GRACE_MS) || 30000
  });
}
