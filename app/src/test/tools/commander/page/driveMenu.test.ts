import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { driveMenu } from '../../../../tools/commander/page/driveMenu';

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
          : [item.label, item.name, item.accessKey, item.checked],
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
});
