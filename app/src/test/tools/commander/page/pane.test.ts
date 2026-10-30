import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { driveOf } from '../../../../tools/commander/page/pane';
import { shareOf } from '../../../../tools/commander/page/tool';

suite('Commander pane', () => {
  test('shows the drive a folder is on, whatever the case of its letter', () => {
    const drives = ['C:\\', 'D:\\'];
    assert.strictEqual(driveOf('C:\\', drives), 'C:\\');
    assert.strictEqual(driveOf('d:\\backup\\2026', drives), 'D:\\');
    assert.strictEqual(driveOf('\\\\server\\share', drives), undefined);
    assert.strictEqual(driveOf('/home', []), undefined);
  });

  test('splits the sides where the divider is dragged, leaving each some room, and evenly before it is laid out', () => {
    assert.strictEqual(shareOf(300, 1000), 0.3);
    assert.strictEqual(shareOf(10, 1000), 0.15);
    assert.strictEqual(shareOf(990, 1000), 0.85);
    assert.strictEqual(shareOf(10, 0), 0.5);
  });
});
