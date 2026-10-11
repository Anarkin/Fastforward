import * as assert from 'node:assert';
import fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from './builtins';
import { fileLog } from '../log';
import { removeFolder, tempFolder } from './repositories';

suite('Log file', () => {
  let folder: string;

  beforeEach(() => {
    folder = tempFolder('log');
  });

  afterEach(() => removeFolder(folder));

  test('writes each line to disk as soon as it is logged, with its time and level, errors with their stack, as an alert holding the main process or a crash can come next', () => {
    const file = path.join(folder, 'logs', 'Fastforward.log');
    const log = fileLog(file);
    log.info('started');
    log.warn('careful');
    log.error(new Error('broke'));
    log.error('plain');
    const lines = fs.readFileSync(file, 'utf8');
    assert.match(lines, /^\d{4}-\d\d-\d\dT[\d:.]+Z \[info\] started$/m);
    assert.match(lines, /\[warn\] careful$/m);
    assert.match(lines, /\[error\] Error: broke\n\s+at /);
    assert.match(lines, /\[error\] plain$/m);
  });

  test('drops a line it cannot write, such as on a full disk, rather than throwing into what logged it, as the handlers of uncaught errors log too, so the next failure crashed the app', () => {
    const file = path.join(folder, 'Fastforward.log');
    const log = fileLog(file);
    const write = fs.writeSync;
    replaceBuiltin(fs, 'writeSync', () => {
      throw Object.assign(new Error('ENOSPC: no space left on device, write'), {
        code: 'ENOSPC',
      });
    });
    try {
      log.info('lost');
      log.error(new Error('lost too'));
    } finally {
      replaceBuiltin(fs, 'writeSync', write);
    }
    log.info('written once there is space');
    const lines = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(lines, /lost/);
    assert.match(lines, /\[info\] written once there is space$/m);
  });

  test('keeps the log of the run before as the previous log', () => {
    const file = path.join(folder, 'Fastforward.log');
    fileLog(file).info('first run');
    fileLog(file).info('second run');
    assert.match(
      fs.readFileSync(path.join(folder, 'Fastforward.previous.log'), 'utf8'),
      /first run/,
    );
    const current = fs.readFileSync(file, 'utf8');
    assert.match(current, /second run/);
    assert.doesNotMatch(current, /first run/);
  });

  test('logs to no file when its file cannot be made or opened, rather than keeping the app from starting', () => {
    const blocked = path.join(folder, 'blocked');
    fs.writeFileSync(blocked, '');
    const log = fileLog(path.join(blocked, 'logs', 'Fastforward.log'));
    log.info('still running');
    log.error(new Error('still running'));
    const inUse = path.join(folder, 'inUse.log');
    fs.mkdirSync(inUse);
    fileLog(inUse).warn('still running');
  });
});
