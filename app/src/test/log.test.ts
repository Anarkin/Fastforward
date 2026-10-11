import * as assert from 'node:assert';
import fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { replaceBuiltin } from './builtins';
import { fileLog } from '../log';
import { removeFolder, tempFolder } from './repositories';

const megabyte = 1024 * 1024;

function oldLines(bytes: number): string {
  const lines: string[] = [];
  let size = 0;
  for (let index = 0; bytes - size >= 100; index++) {
    const line = `2026-01-01T00:00:00.000Z [info] old line ${index}\n`;
    lines.push(line);
    size += line.length;
  }
  const last = '2026-01-01T00:00:00.000Z [info] last old line ';
  lines.push(last.padEnd(bytes - size - 1, 'x') + '\n');
  return lines.join('');
}

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

  test('keeps every run in the one file, oldest first', () => {
    const file = path.join(folder, 'Fastforward.log');
    fileLog(file).info('first run');
    fileLog(file).info('second run');
    assert.match(fs.readFileSync(file, 'utf8'), /first run[^]*second run/);
  });

  test('cuts the log down to about its newest 5 MB, from a line on, when a run starts with it over 10 MB, so it stays small enough to send', () => {
    const file = path.join(folder, 'Fastforward.log');
    const old = oldLines(10 * megabyte + 1);
    fs.writeFileSync(file, old);
    fileLog(file).info('next run');
    const kept = fs.readFileSync(file, 'utf8');
    const keptOld = kept.slice(0, kept.lastIndexOf('\n', kept.length - 2) + 1);
    assert.ok(old.endsWith(keptOld));
    assert.ok(keptOld.length <= 5 * megabyte, `kept ${keptOld.length} bytes`);
    assert.ok(
      keptOld.length > 5 * megabyte - 100,
      `kept ${keptOld.length} bytes`,
    );
    assert.match(keptOld, /^2026-01-01T00:00:00\.000Z \[info\] old line \d+\n/);
    assert.match(kept, /\[info\] next run\n$/);
  });

  test('leaves a log of 10 MB as it is', () => {
    const file = path.join(folder, 'Fastforward.log');
    const old = oldLines(10 * megabyte);
    fs.writeFileSync(file, old);
    fileLog(file).info('next run');
    assert.ok(fs.readFileSync(file, 'utf8').startsWith(old));
  });

  test('removes the previous log that older versions kept beside it', () => {
    const file = path.join(folder, 'Fastforward.log');
    const previous = path.join(folder, 'Fastforward.previous.log');
    fs.writeFileSync(previous, 'older version');
    fileLog(file).info('next run');
    assert.ok(!fs.existsSync(previous));
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
