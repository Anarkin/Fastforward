import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { iconKey, Icons } from '../../../../tools/commander/main/icons';

const at = (...names: string[]) => path.join(path.resolve('/'), ...names);

suite('Commander icons', () => {
  test('share one icon among the files of an extension, but not among programs, icons and shortcuts on Windows', () => {
    assert.strictEqual(iconKey(at('a.TXT'), 'win32'), 'extension:txt');
    assert.strictEqual(iconKey(at('Makefile'), 'linux'), 'extension:');
    assert.strictEqual(
      iconKey(at('setup.exe'), 'win32'),
      `file:${at('setup.exe')}`,
    );
    assert.strictEqual(
      iconKey(at('Home.lnk'), 'win32'),
      `file:${at('Home.lnk')}`,
    );
    assert.strictEqual(iconKey(at('setup.exe'), 'linux'), 'extension:exe');
  });

  test('load each icon once, and again after a load fails', async () => {
    const loaded: string[] = [];
    let failing = true;
    const icons = new Icons((file) => {
      loaded.push(file);
      if (file.endsWith('.zip') && failing) {
        failing = false;
        return Promise.reject(new Error('busy'));
      }
      return Promise.resolve(new Uint8Array([loaded.length]));
    }, 'win32');

    await icons.of(at('a.txt'));
    await icons.of(at('b.txt'));
    await icons.of(at('setup.exe'));
    await icons.of(at('other', 'setup.exe'));
    await assert.rejects(icons.of(at('a.zip')));
    await icons.of(at('a.zip'));

    assert.deepStrictEqual(loaded, [
      at('a.txt'),
      at('setup.exe'),
      at('other', 'setup.exe'),
      at('a.zip'),
      at('a.zip'),
    ]);
  });
});
