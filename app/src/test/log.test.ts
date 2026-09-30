import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileLog } from '../log';

async function flushed(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

suite('Log file', () => {
  let folder: string;

  setup(() => {
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fastforward-log-'));
  });

  teardown(() => fs.rmSync(folder, { recursive: true, force: true }));

  test('writes each line with its time and level, errors with their stack', async () => {
    const file = path.join(folder, 'logs', 'Fastforward.log');
    const log = fileLog(file);
    log.info('started');
    log.warn('careful');
    log.error(new Error('broke'));
    log.error('plain');
    await flushed();
    const lines = fs.readFileSync(file, 'utf8');
    assert.match(lines, /^\d{4}-\d\d-\d\dT[\d:.]+Z \[info\] started$/m);
    assert.match(lines, /\[warn\] careful$/m);
    assert.match(lines, /\[error\] Error: broke\n\s+at /);
    assert.match(lines, /\[error\] plain$/m);
  });

  test('keeps the log of the run before as the previous log', async () => {
    const file = path.join(folder, 'Fastforward.log');
    fileLog(file).info('first run');
    await flushed();
    fileLog(file).info('second run');
    await flushed();
    assert.match(
      fs.readFileSync(path.join(folder, 'Fastforward.previous.log'), 'utf8'),
      /first run/,
    );
    const current = fs.readFileSync(file, 'utf8');
    assert.match(current, /second run/);
    assert.doesNotMatch(current, /first run/);
  });
});
