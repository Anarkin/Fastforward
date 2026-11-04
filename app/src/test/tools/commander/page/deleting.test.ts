import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { deleteQuestion } from '../../../../tools/commander/page/deleting';

suite('Commander deleting', () => {
  test('asks before moving to the Recycle Bin on Windows and to the Trash elsewhere, naming a single item and counting more', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], false, 'win32'), {
      title: 'Delete',
      message: 'Move "a.txt" to the Recycle Bin?',
      confirm: 'Move to the Recycle Bin',
    });
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'b', 'c'], false, 'darwin'),
      {
        title: 'Delete',
        message: 'Move 3 items to the Trash?',
        confirm: 'Move to the Trash',
      },
    );
  });

  test('warns that deleting for good cannot be undone', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], true, 'win32'), {
      title: 'Delete Permanently',
      message: 'Delete "a.txt" permanently? This cannot be undone.',
      confirm: 'Delete Permanently',
    });
    assert.deepStrictEqual(deleteQuestion(['a.txt', 'b'], true, 'linux'), {
      title: 'Delete Permanently',
      message: 'Delete 2 items permanently? This cannot be undone.',
      confirm: 'Delete Permanently',
    });
  });
});
