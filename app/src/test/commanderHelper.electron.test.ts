import * as assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { elevatedFileSystem } from '../tools/commander/main/elevated';
import { helperArguments } from '../tools/commander/main/helper';
import { appFolder } from './appFixtures';
import { waitFor } from './fixtures';
import { removeFolder, tempFolder } from './repositories';

const electron: string = createRequire(__filename)('electron');

suite('The commander helper started from the app', () => {
  let folder: string;

  beforeAll(() => {
    folder = tempFolder('commander-helper');
    fs.writeFileSync(path.join(folder, 'notes.txt'), '12345');
  });

  afterAll(() => removeFolder(folder));

  test('starts as the app in helper mode, without a window, lists folders over its pipe and quits once the app goes', async () => {
    let helper: ChildProcess | undefined;
    const elevated = await elevatedFileSystem((address) => {
      helper = spawn(electron, [appFolder, ...helperArguments(address)], {
        stdio: 'ignore',
      });
      return Promise.resolve(true);
    }, process.platform);
    assert.ok(elevated && helper);
    const exited = new Promise<number | null>((resolve) =>
      helper?.on('exit', resolve),
    );

    const entries = await elevated.list(folder);
    assert.deepStrictEqual(
      entries.map((entry) => [entry.name, entry.size]),
      [['notes.txt', 5]],
    );
    await assert.rejects(elevated.list(path.join(folder, 'missing')), {
      code: 'ENOENT',
    });

    elevated.close();
    let code: number | null | undefined;
    void exited.then((value) => (code = value));
    await waitFor(() => code !== undefined, 'the helper to quit');
    assert.strictEqual(code, 0);
  });
});
