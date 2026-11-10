import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { iconKey, Icons } from '../../../../tools/commander/main/icons';

const at = (...names: string[]) => path.join(path.resolve('/'), ...names);

const held = () => {
  const clock = { now: 0 };
  const started: string[] = [];
  const finishes = new Map<string, () => void>();
  const icons = new Icons(
    (file) => {
      started.push(path.basename(file));
      return new Promise((resolve) => {
        finishes.set(path.basename(file), () =>
          resolve(new Uint8Array([started.length])),
        );
      });
    },
    'win32',
    2,
    () => clock.now,
  );
  const finish = async (name: string) => {
    finishes.get(name)?.();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { icons, started, finish, clock };
};

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

  test('loads a few icons at a time, those asked for together in their order, top to bottom, and those asked for last before those asked for earlier, as they are the ones in view', async () => {
    const { icons, started, finish, clock } = held();
    const asked = ['a', 'b', 'c', 'd'].map((name) =>
      icons.of(at(`${name}.exe`), name),
    );
    clock.now = 49;
    asked.push(icons.of(at('e.exe'), 'e'));
    clock.now = 200;
    asked.push(...['f', 'g'].map((name) => icons.of(at(`${name}.exe`), name)));
    assert.deepStrictEqual(started, ['a.exe', 'b.exe']);
    for (const name of ['a', 'b', 'f', 'g', 'c', 'd', 'e']) {
      await finish(`${name}.exe`);
    }
    assert.deepStrictEqual(started, [
      'a.exe',
      'b.exe',
      'f.exe',
      'g.exe',
      'c.exe',
      'd.exe',
      'e.exe',
    ]);
    await Promise.all(asked);
  });

  test('never loads an icon dropped while it waits, or dropped before it was asked for, and still loads one dropped once loading', async () => {
    const { icons, started, finish } = held();
    const first = icons.of(at('a.exe'), '1');
    const waiting = icons.of(at('b.exe'), '2');
    const dropped = icons.of(at('c.exe'), '3');
    icons.drop(['3', '1', '5']);
    const early = icons.of(at('e.exe'), '5');
    await assert.rejects(dropped);
    await assert.rejects(early);
    await finish('a.exe');
    await finish('b.exe');
    await first;
    await waiting;
    assert.deepStrictEqual(started, ['a.exe', 'b.exe']);
  });

  test('forgets the tickets dropped by a page once it loads anew, as the tickets of the new page start over and one of its icons was refused', async () => {
    const { icons, started, finish } = held();
    icons.drop(['1']);
    icons.forgetDropped();

    const asked = icons.of(at('a.exe'), '1');
    await finish('a.exe');
    await asked;
    assert.deepStrictEqual(started, ['a.exe']);
  });

  test('gives an icon loaded or loading to whoever asks for it, without waiting its turn or loading it again', async () => {
    const { icons, started, finish } = held();
    const one = icons.of(at('one.txt'), '1');
    const other = icons.of(at('other.txt'), '2');
    const third = icons.of(at('third.txt'), '3');
    assert.deepStrictEqual(started, ['one.txt']);
    await finish('one.txt');
    await Promise.all([one, other, third]);
    const again = icons.of(at('again.txt'), '4');
    await again;
    assert.deepStrictEqual(started, ['one.txt']);
  });
});
