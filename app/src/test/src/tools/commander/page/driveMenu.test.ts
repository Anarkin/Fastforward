import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  driveMenu,
  driveOf,
} from '../../../../../tools/commander/page/driveMenu';

suite('Commander drive menu', () => {
  test('lists the drives as names, each chosen by its letter, the drive of the side checked', () => {
    const chosen: string[] = [];
    const items = driveMenu(['C:\\', 'D:\\'], 'D:\\', (drive) =>
      chosen.push(drive),
    );
    assert.deepStrictEqual(
      items.map((item) =>
        'separator' in item
          ? '---'
          : [item.label, item.path, item.accessKey, item.checked],
      ),
      [
        ['C:\\', true, 'C', false],
        ['D:\\', true, 'D', true],
      ],
    );
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
      }
    }
    assert.deepStrictEqual(chosen, ['C:\\', 'D:\\']);
  });

  test('shows the drive a folder is on, whatever the case of its letter', () => {
    const drives = ['C:\\', 'D:\\'];
    assert.strictEqual(driveOf('C:\\', drives), 'C:\\');
    assert.strictEqual(driveOf('d:\\backup\\2026', drives), 'D:\\');
    assert.strictEqual(driveOf('\\\\server\\share', drives), undefined);
    assert.strictEqual(driveOf('/home', []), undefined);
  });
});
