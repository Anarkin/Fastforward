import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileLog } from '../log';
import { removeFolder, tempFolder } from './repositories';

suite('Log file', () => {
  let folder: string;

  setup(() => {
    folder = tempFolder('log');
  });

  teardown(() => removeFolder(folder));

  test('writes each line with its time and level, errors with their stack', () => {
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

  test('has each line on disk as soon as it is logged, as an alert holding the main process or a crash can come next', () => {
    const file = path.join(folder, 'Fastforward.log');
    fileLog(file).error('Install git');
    assert.match(fs.readFileSync(file, 'utf8'), /\[error\] Install git$/m);
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
});
