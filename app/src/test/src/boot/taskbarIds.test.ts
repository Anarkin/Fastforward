import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  TaskbarIds,
  appId,
  taskbarBase,
  taskbarDetails,
} from '../../../boot/taskbarIds';

const ids = (
  perWindow: boolean,
  windows: readonly string[],
  given: TaskbarIds,
) => windows.map((window) => given.of(window, perWindow));

suite('Taskbar IDs', () => {
  test('groups every window under the ID of the app, the one its shortcuts are made with, so a pinned Fastforward holds its windows, a development build under one of its own beside it', () => {
    const packaged: unknown = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../../../package.json'), 'utf8'),
    );
    assert.deepStrictEqual(
      { build: { appId } },
      {
        build: {
          appId: Reflect.get(
            Object(Reflect.get(Object(packaged), 'build')),
            'appId',
          ),
        },
      },
    );
    assert.strictEqual(taskbarBase(false), appId);
    assert.strictEqual(taskbarBase(true), `${appId}.development`);
    assert.deepStrictEqual(ids(false, ['1', '2', '3'], new TaskbarIds('ff')), [
      'ff',
      'ff',
      'ff',
    ]);
  });

  test("gives each window a button of its own on the taskbar, the first the app's ID, so it stays with a pinned Fastforward, and each other the lowest number free, so Windows keeps no new ID for every window ever opened", () => {
    const given = new TaskbarIds('ff');
    assert.deepStrictEqual(ids(true, ['1', '2', '3'], given), [
      'ff',
      'ff.window.2',
      'ff.window.3',
    ]);
    given.forget('2');
    assert.deepStrictEqual(ids(true, ['4', '1', '3'], given), [
      'ff.window.2',
      'ff',
      'ff.window.3',
    ]);
    given.forget('1');
    assert.strictEqual(given.of('5', true), 'ff');
  });

  test('frees the numbers of the windows grouped again, so a window splits off afresh from the first once it is turned on again', () => {
    const given = new TaskbarIds('ff');
    ids(true, ['1', '2', '3'], given);
    assert.deepStrictEqual(ids(false, ['1', '2', '3'], given), [
      'ff',
      'ff',
      'ff',
    ]);
    assert.deepStrictEqual(ids(true, ['3', '1'], given), ['ff', 'ff.window.2']);
  });

  test('starts Fastforward from a button of any window pinned, with its icon and name, rather than the program alone, the app of a development build named after the program', () => {
    const app = {
      icon: 'C:\\Fastforward\\dist\\icon.ico',
      program: 'C:\\Program Files\\Fastforward\\Fastforward.exe',
      appPath: undefined,
      name: 'Fastforward',
    };
    assert.deepStrictEqual(taskbarDetails('ff.window.2', app), {
      appId: 'ff.window.2',
      appIconPath: 'C:\\Fastforward\\dist\\icon.ico',
      relaunchCommand: '"C:\\Program Files\\Fastforward\\Fastforward.exe"',
      relaunchDisplayName: 'Fastforward',
    });
    assert.strictEqual(
      taskbarDetails('ff', {
        ...app,
        program: 'C:\\app\\electron.exe',
        appPath: 'C:\\app',
      }).relaunchCommand,
      '"C:\\app\\electron.exe" "C:\\app"',
    );
  });
});
