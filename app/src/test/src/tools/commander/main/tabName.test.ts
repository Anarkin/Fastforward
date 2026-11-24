import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { sidesName } from '../../../../../tools/commander/main/tabName';

suite('Commander tab name', () => {
  test('names the folders of the two sides, left first, apart', () => {
    assert.strictEqual(
      sidesName('C:\\Windows\\System32', 'C:\\', path.win32),
      'System32 · C:\\',
    );
    assert.strictEqual(
      sidesName('/home/me/src', '/srv', path.posix),
      'src · srv',
    );
  });

  test('names a folder both sides show once, the case of a Windows path aside', () => {
    assert.strictEqual(
      sidesName('C:\\Users\\Me', 'c:\\users\\me\\', path.win32),
      'Me',
    );
    assert.strictEqual(sidesName('/', '/', path.posix), '/');
  });

  test('names two folders of one name apart, as two sides each showing a src', () => {
    assert.strictEqual(
      sidesName('C:\\a\\src', 'C:\\b\\src', path.win32),
      'src · src',
    );
  });

  test('names the side it knows alone, and the commander while it knows neither', () => {
    assert.strictEqual(sidesName(undefined, 'D:\\', path.win32), 'D:\\');
    assert.strictEqual(
      sidesName(undefined, undefined, path.win32),
      'Commander',
    );
  });
});
