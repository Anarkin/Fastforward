import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { writeAtomically } from '../../../../lib/main/textFiles';
import { UserSettings } from '../../../../shell/main/userSettings';
import { defaultSettings } from '../../../helpers/fixtures';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';
import { symlinkOrSkip } from '../../../helpers/links';

const defaults = defaultSettings();

async function renameFailing(
  failures: number,
  code: string,
  run: () => Promise<void>,
): Promise<number> {
  const rename = fs.promises.rename;
  let renames = 0;
  Reflect.set(fs.promises, 'rename', (...args: Parameters<typeof rename>) => {
    renames += 1;
    return renames <= failures
      ? Promise.reject(Object.assign(new Error(code), { code }))
      : rename(...args);
  });
  try {
    await run();
  } finally {
    Reflect.set(fs.promises, 'rename', rename);
  }
  return renames;
}

suite('Writing a file whole', () => {
  test('flushes the new text to the disk before putting it in place, so a crash leaves the old file or the new one, not an empty one', async () => {
    const folder = tempFolder('flushed');
    const file = path.join(folder, 'state.json');
    const nodeFs = process.getBuiltinModule('node:fs');
    const { open, rename } = nodeFs.promises;
    const steps: string[] = [];
    Reflect.set(
      nodeFs.promises,
      'open',
      async (...args: Parameters<typeof open>) => {
        const handle = await open(...args);
        const sync = handle.sync.bind(handle);
        Reflect.set(handle, 'sync', () => {
          steps.push('sync');
          return sync();
        });
        return handle;
      },
    );
    Reflect.set(
      nodeFs.promises,
      'rename',
      (...args: Parameters<typeof rename>) => {
        steps.push('rename');
        return rename(...args);
      },
    );
    try {
      await writeAtomically(file, '{"a":1}');
      assert.deepStrictEqual(steps, ['sync', 'rename']);
      assert.strictEqual(fs.readFileSync(file, 'utf8'), '{"a":1}');
    } finally {
      Reflect.set(nodeFs.promises, 'open', open);
      Reflect.set(nodeFs.promises, 'rename', rename);
      removeFolder(folder);
    }
  });
});

suite('Replacing a file', () => {
  let folder: string;
  let file: string;

  beforeEach(() => {
    folder = tempFolder('settings');
    file = path.join(folder, 'settings.user.json');
  });

  afterEach(() => removeFolder(folder));

  test('neither replaces a symlink nor makes the folder it points into while that folder is missing', async (context) => {
    const target = path.join(folder, 'dotfiles', 'settings.json');
    symlinkOrSkip(context, target, file);
    await assert.rejects(writeAtomically(file, '{}'), { code: 'ENOENT' });
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.ok(!fs.existsSync(path.dirname(target)));
  });
  test('saves once the file is let go, as Windows refuses to replace a file antivirus or the indexer holds for a moment', async () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      const user = new UserSettings(defaults, file);
      const renames = await renameFailing(2, code, () =>
        user.setImages('realSize', code === 'EBUSY'),
      );
      assert.strictEqual(renames, 3);
      assert.strictEqual(
        new UserSettings(defaults, file).settings.images.realSize,
        code === 'EBUSY',
      );
    }
  });

  test('removes its temporary file when the file stays held', async () => {
    let failure: unknown;
    const renames = await renameFailing(Infinity, 'EPERM', () =>
      writeAtomically(file, '{}', [1, 1]).catch((error: unknown) => {
        failure = error;
      }),
    );
    assert.strictEqual(renames, 3);
    assert.match(String(failure), /EPERM/);
    assert.ok(!fs.existsSync(`${file}.tmp`));
    assert.ok(!fs.existsSync(file));
  });

  test('gives up at once when the file can never be replaced', async () => {
    let failure: unknown;
    const renames = await renameFailing(Infinity, 'EISDIR', () =>
      writeAtomically(file, '{}').catch((error: unknown) => {
        failure = error;
      }),
    );
    assert.strictEqual(renames, 1);
    assert.match(String(failure), /EISDIR/);
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });
});
