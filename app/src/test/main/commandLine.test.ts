import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  foldersHandedOff,
  foldersOf,
  handOff,
  wantsTerminal,
} from '../../main/commandLine';

suite('Command line', () => {
  const started = path.resolve('work');
  const app = path.resolve('Fastforward', 'Fastforward.exe');

  test('opens the folders it is given, resolved from the folder it was started in, skipping the switches', () => {
    assert.deepStrictEqual(
      foldersOf(
        [app, '--updated', 'repository', path.join('..', 'other')],
        false,
        started,
      ),
      [path.join(started, 'repository'), path.resolve('other')],
    );
  });

  test('opens no folder when given none, as when started from the Start menu or by the installer', () => {
    assert.deepStrictEqual(foldersOf([app], false, started), []);
    assert.deepStrictEqual(foldersOf([app, '--updated'], false, started), []);
  });

  test('skips the folder of the app, the first argument after the switches, when run from the source by Electron', () => {
    const electron = path.resolve('electron.exe');
    const source = path.resolve('app');
    assert.deepStrictEqual(
      foldersOf(
        [electron, '--inspect=0', source, '--user-data-dir=profile'],
        true,
        started,
      ),
      [],
    );
    assert.deepStrictEqual(
      foldersOf([electron, source, '--', '.'], true, started),
      [started],
    );
  });

  test('takes every argument after -- as a folder, even one starting with a dash, so no folder passes for a switch', () => {
    assert.deepStrictEqual(
      foldersOf(
        [app, '--', '--remote-debugging-port=9222', 'a b', '--'],
        false,
        started,
      ),
      [
        path.join(started, '--remote-debugging-port=9222'),
        path.join(started, 'a b'),
        path.join(started, '--'),
      ],
    );
  });

  test('hands the folders to the app already running as data, as Chromium reorders the command line it passes along and adds to it', () => {
    const folders = [path.join(started, 'a'), path.join(started, 'b')];
    assert.deepStrictEqual(foldersHandedOff(handOff(folders)), folders);
  });

  test('takes only absolute paths from the data handed off, as any program can start the app', () => {
    const absolute = path.join(started, 'a');
    assert.deepStrictEqual(
      foldersHandedOff({ folders: [absolute, 'relative', 3, null] }),
      [absolute],
    );
    for (const data of [undefined, null, 'folders', {}, { folders: 'a' }]) {
      assert.deepStrictEqual(foldersHandedOff(data), [], JSON.stringify(data));
    }
  });

  test('runs in the terminal when asked to with --term before the folders, and not for a folder named so', () => {
    assert.strictEqual(wantsTerminal([app, '--term', '--', '.']), true);
    assert.strictEqual(wantsTerminal([app, 'repository', '--term']), true);
    assert.strictEqual(wantsTerminal([app, '--', '--term']), false);
    assert.strictEqual(wantsTerminal([app, 'repository']), false);
  });
});
