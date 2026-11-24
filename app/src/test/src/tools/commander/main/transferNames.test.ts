import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { runTransfer } from '../../../../../tools/commander/main/transfer';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

let folder: string;
let source: string;
let target: string;

beforeEach(() => {
  folder = tempFolder('transfer-long');
  source = path.join(folder, 's');
  target = path.join(folder, 't');
  fs.mkdirSync(source);
  fs.mkdirSync(target);
});

afterEach(() => {
  removeFolder(folder);
});

suite('Transfer, the names it writes under', () => {
  test('overwrites a file whose name is as long as a name may be, in a copy and in a move, as the copy written beside it took a name past the longest and failed', async () => {
    const name = `${'n'.repeat(245)}.txt`;
    for (const move of [false, true]) {
      fs.writeFileSync(path.join(source, name), `new ${String(move)}`);
      fs.writeFileSync(path.join(target, name), 'old');
      const failures: string[] = [];

      await runTransfer(
        { sources: [path.join(source, name)], target, move },
        {
          progress: () => undefined,
          clash: () => Promise.resolve({ answer: 'overwrite', all: false }),
          failed: (failed, reason) => failures.push(`${failed}: ${reason}`),
        },
        { stopped: () => false, cloning: false },
      );

      assert.deepStrictEqual(failures, []);
      assert.strictEqual(
        fs.readFileSync(path.join(target, name), 'utf8'),
        `new ${String(move)}`,
      );
      assert.deepStrictEqual(fs.readdirSync(target), [name]);
    }
  });

  test('writes a copy under its name only once it is whole, so a copy stopped by a crash or a kill leaves no file under the name looking whole, and replaces no file that came there meanwhile', async () => {
    const big = path.join(source, 'big.bin');
    fs.writeFileSync(big, Buffer.alloc(10_000, 7));
    const seen: boolean[] = [];

    await runTransfer(
      { sources: [big], target, move: false },
      {
        progress: ({ bytes, totalBytes }) => {
          if (bytes > 0 && bytes < totalBytes) {
            seen.push(fs.existsSync(path.join(target, 'big.bin')));
          }
        },
        clash: () => Promise.resolve({ answer: 'stop', all: false }),
        failed: () => undefined,
      },
      {
        stopped: () => false,
        piecesFrom: 4000,
        pieceBytes: 1000,
        cloning: false,
        progressEvery: 0,
      },
    );

    assert.ok(seen.length > 0);
    assert.ok(
      seen.every((exists) => !exists),
      JSON.stringify(seen),
    );
    assert.strictEqual(fs.statSync(path.join(target, 'big.bin')).size, 10_000);
    assert.deepStrictEqual(fs.readdirSync(target), ['big.bin']);
  });
});
