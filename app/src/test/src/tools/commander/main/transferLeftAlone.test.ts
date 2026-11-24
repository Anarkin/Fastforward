import * as assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test, vi } from 'vitest';
import { runTransfer } from '../../../../../tools/commander/main/transfer';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

let folder: string;
let source: string;
let target: string;

beforeEach(() => {
  folder = tempFolder('transfer-left');
  source = path.join(folder, 'source');
  target = path.join(folder, 'target');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeFolder(folder);
});

async function run(
  sources: readonly string[],
  options: { piecesFrom?: number; pieceBytes?: number; cloning?: boolean } = {},
) {
  const failures: string[] = [];
  await runTransfer(
    { sources, target, move: false },
    {
      progress: () => undefined,
      clash: () => Promise.resolve({ answer: 'stop', all: false }),
      failed: (name, reason) => failures.push(`${name}: ${reason}`),
    },
    { stopped: () => false, ...options },
  );
  return { failures };
}

suite('Transfer, leaving alone what it cannot copy', () => {
  test.skipIf(process.platform === 'win32')(
    'refuses a named pipe rather than waiting for ever for what it is to hold, copying the rest',
    async () => {
      execFileSync('mkfifo', [path.join(source, 'pipe')]);
      fs.writeFileSync(path.join(source, 'a.txt'), 'aaa');

      const copied = await run([
        path.join(source, 'pipe'),
        path.join(source, 'a.txt'),
      ]);

      assert.deepStrictEqual(copied.failures, [
        `pipe: ${strings.commander.notCopied}`,
      ]);
      assert.deepStrictEqual(fs.readdirSync(target), ['a.txt']);
    },
  );

  test('leaves a file another program made where a large file was to be copied in pieces as it was, failing that file, rather than deleting what it never wrote', async () => {
    const big = path.join(source, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(10_000, 7));
    const made = path.join(target, 'big.bin');
    const open = fs.promises.open.bind(fs.promises);
    vi.spyOn(fs.promises, 'open').mockImplementation(
      async (file, flags, mode) => {
        if (file === made && flags === 'wx') {
          fs.writeFileSync(made, 'theirs');
        }
        return open(file, flags, mode);
      },
    );

    const copied = await run([big], {
      piecesFrom: 4000,
      pieceBytes: 1000,
      cloning: false,
    });

    assert.strictEqual(copied.failures.length, 1);
    assert.strictEqual(fs.readFileSync(made, 'utf8'), 'theirs');
  });
});
