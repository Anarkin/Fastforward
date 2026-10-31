import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  elevatedCommand,
  quoted,
} from '../../../../tools/commander/main/windowsElevation';

const address = { pipe: '\\\\.\\pipe\\fastforward-helper-1', token: 'abc' };

suite('Starting the helper as administrator on Windows', () => {
  test('quotes each argument as Windows reads them back, spaces, quotes and trailing backslashes kept', () => {
    assert.strictEqual(
      quoted('C:\\Program Files\\app'),
      '"C:\\Program Files\\app"',
    );
    assert.strictEqual(quoted('say "hi"'), '"say \\"hi\\""');
    assert.strictEqual(quoted('C:\\folder\\'), '"C:\\folder\\\\"');
  });

  test('starts the installed app itself, or Electron with the app folder while developing, in helper mode', () => {
    assert.deepStrictEqual(
      elevatedCommand('C:\\Fastforward\\Fastforward.exe', undefined, address),
      {
        file: 'C:\\Fastforward\\Fastforward.exe',
        parameters:
          '"--commander-helper=\\\\.\\pipe\\fastforward-helper-1" "--commander-token=abc"',
      },
    );
    assert.deepStrictEqual(
      elevatedCommand('C:\\dev\\electron.exe', 'C:\\Code\\my app', address),
      {
        file: 'C:\\dev\\electron.exe',
        parameters:
          '"C:\\Code\\my app" "--commander-helper=\\\\.\\pipe\\fastforward-helper-1" "--commander-token=abc"',
      },
    );
  });
});
