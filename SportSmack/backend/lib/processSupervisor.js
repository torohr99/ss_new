/**
 * Coordinates shutdown of the API and worker child processes.
 * The parent remains alive until every child closes, escalating to SIGKILL
 * only after the configured grace period.
 */
function superviseChildren({
  children,
  processRef = process,
  logger = console,
  gracePeriodMs = 20000
}) {
  if (!Array.isArray(children) || children.length === 0) {
    throw new Error('At least one child process is required.');
  }

  const states = children.map(({ name, child }) => ({
    name,
    child,
    closed: false
  }));

  let shuttingDown = false;
  let shutdownPromise = null;
  let escalationTimer = null;

  const allClosed = () => states.every(state => state.closed);

  const cleanup = () => {
    if (escalationTimer) {
      clearTimeout(escalationTimer);
      escalationTimer = null;
    }

    processRef.removeListener('SIGTERM', onSigterm);
    processRef.removeListener('SIGINT', onSigint);
  };

  let resolveShutdown;

  const finishIfClosed = () => {
    if (!shuttingDown || !allClosed()) {
      return;
    }

    cleanup();

    if (resolveShutdown) {
      resolveShutdown();
      resolveShutdown = null;
    }
  };

  function shutdown(reason, exitCode = 0) {
    if (shutdownPromise) {
      if (exitCode !== 0) {
        processRef.exitCode = exitCode;
      }
      return shutdownPromise;
    }

    shuttingDown = true;
    processRef.exitCode = exitCode;

    logger.info('Stopping supervised SportSmack services', {
      reason,
      exitCode
    });

    shutdownPromise = new Promise(resolve => {
      resolveShutdown = resolve;

      escalationTimer = setTimeout(() => {
        for (const state of states) {
          if (!state.closed) {
            logger.error('Child did not stop within the shutdown grace period; sending SIGKILL.', {
              service: state.name,
              gracePeriodMs
            });

            try {
              state.child.kill('SIGKILL');
            } catch (error) {
              logger.error('Failed to force-stop child process.', {
                service: state.name,
                error
              });
            }
          }
        }
      }, gracePeriodMs);

      if (typeof escalationTimer.unref === 'function') {
        escalationTimer.unref();
      }

      for (const state of states) {
        if (!state.closed) {
          try {
            state.child.kill('SIGTERM');
          } catch (error) {
            logger.error('Failed to request child shutdown.', {
              service: state.name,
              error
            });
          }
        }
      }

      finishIfClosed();
    });

    return shutdownPromise;
  }

  function onSigterm() {
    shutdown('SIGTERM', 0);
  }

  function onSigint() {
    shutdown('SIGINT', 0);
  }

  processRef.on('SIGTERM', onSigterm);
  processRef.on('SIGINT', onSigint);

  for (const state of states) {
    state.child.on('error', error => {
      logger.error('Supervised child process error.', {
        service: state.name,
        error
      });
      shutdown(`${state.name} failed`, 1);
    });

    state.child.on('close', (code, signal) => {
      state.closed = true;

      logger.info('Supervised child process closed.', {
        service: state.name,
        code,
        signal
      });

      if (!shuttingDown) {
        // A child exiting on its own means the combined service is unhealthy,
        // even when it reports exit code 0. Stop its sibling and let the
        // platform restart the parent service.
        shutdown(`${state.name} exited unexpectedly`, code === 0 ? 1 : (code ?? 1));
      }

      finishIfClosed();
    });
  }

  return {
    shutdown,
    get isShuttingDown() {
      return shuttingDown;
    }
  };
}

module.exports = superviseChildren;
