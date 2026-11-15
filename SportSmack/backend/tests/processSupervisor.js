'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const superviseChildren = require('../lib/processSupervisor');

class FakeProcess extends EventEmitter {
  exitCode = undefined;
}

class FakeChild extends EventEmitter {
  signals = [];
  closeOnTerm = true;

  kill(signal) {
    this.signals.push(signal);

    if (signal === 'SIGTERM' && this.closeOnTerm) {
      queueMicrotask(() => this.emit('close', 0, signal));
    }

    if (signal === 'SIGKILL') {
      queueMicrotask(() => this.emit('close', null, signal));
    }

    return true;
  }
}

const logger = {
  info() {},
  error() {}
};

async function testSignalDrainsAllChildren() {
  const processRef = new FakeProcess();
  const api = new FakeChild();
  const worker = new FakeChild();

  superviseChildren({
    children: [
      { name: 'API', child: api },
      { name: 'worker', child: worker }
    ],
    processRef,
    logger,
    gracePeriodMs: 100
  });

  processRef.emit('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(api.signals, ['SIGTERM']);
  assert.deepEqual(worker.signals, ['SIGTERM']);
  assert.equal(processRef.exitCode, 0);
  assert.equal(processRef.listenerCount('SIGTERM'), 0);
}

async function testUnexpectedExitStopsSiblingAndFailsParent() {
  const processRef = new FakeProcess();
  const api = new FakeChild();
  const worker = new FakeChild();

  superviseChildren({
    children: [
      { name: 'API', child: api },
      { name: 'worker', child: worker }
    ],
    processRef,
    logger,
    gracePeriodMs: 100
  });

  api.emit('close', 1, null);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.deepEqual(worker.signals, ['SIGTERM']);
  assert.equal(processRef.exitCode, 1);
  assert.equal(processRef.listenerCount('SIGTERM'), 0);
}

async function testGracePeriodEscalatesToSigkill() {
  const processRef = new FakeProcess();
  const stubborn = new FakeChild();
  stubborn.closeOnTerm = false;

  superviseChildren({
    children: [{ name: 'worker', child: stubborn }],
    processRef,
    logger,
    gracePeriodMs: 10
  });

  processRef.emit('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.deepEqual(stubborn.signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(processRef.exitCode, 0);
}

(async () => {
  await testSignalDrainsAllChildren();
  await testUnexpectedExitStopsSiblingAndFailsParent();
  await testGracePeriodEscalatesToSigkill();
  console.log('ALL PROCESS SUPERVISOR TESTS PASSED');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
