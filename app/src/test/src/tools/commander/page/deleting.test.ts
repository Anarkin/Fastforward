import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { deleteQuestion } from '../../../../../tools/commander/page/deleting';

suite('Commander deleting', () => {
  test('asks before moving to the Recycle Bin on Windows and to the Trash elsewhere, naming a single item on a line of its own and counting more', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], false, 'win32'), {
      title: 'Delete',
      message: 'Move to the Recycle Bin?',
      lines: [{ label: 'Item', name: 'a.txt' }],
      confirm: 'Move to the Recycle Bin',
    });
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'b', 'c'], false, 'darwin'),
      {
        title: 'Delete',
        message: 'Move 3 items to the Trash?',
        lines: [],
        confirm: 'Move to the Trash',
      },
    );
  });

  test('warns that deleting for good cannot be undone', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], true, 'win32'), {
      title: 'Delete Permanently',
      message: 'Delete permanently? This cannot be undone.',
      lines: [{ label: 'Item', name: 'a.txt' }],
      confirm: 'Delete Permanently',
    });
    assert.deepStrictEqual(deleteQuestion(['a.txt', 'b'], true, 'linux'), {
      title: 'Delete Permanently',
      message: 'Delete 2 items permanently? This cannot be undone.',
      lines: [],
      confirm: 'Delete Permanently',
    });
  });

  test('says the items will be deleted permanently, and why, on a drive whose Recycle Bin is turned off, as Delete failed there saying only that the delete operation failed', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], true, 'win32', true), {
      title: 'Delete Permanently',
      message:
        'The Recycle Bin of this drive is turned off. Delete permanently? This cannot be undone.',
      lines: [{ label: 'Item', name: 'a.txt' }],
      confirm: 'Delete Permanently',
    });
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'b'], true, 'win32', true).message,
      'The Recycle Bin of this drive is turned off. Delete 2 items permanently? This cannot be undone.',
    );
  });

  test('asks before deleting from an archive permanently, naming the archive on a line of its own, as an archive has no Recycle Bin', () => {
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'docs'], true, 'linux', false, '/x/photos.zip'),
      {
        title: 'Delete Permanently',
        message:
          'Delete 2 items from the archive permanently? This cannot be undone.',
        lines: [{ label: 'Archive', name: 'photos.zip' }],
        confirm: 'Delete Permanently',
      },
    );
    assert.deepStrictEqual(
      deleteQuestion(['a.txt'], true, 'win32', false, 'C:\\x\\photos.zip'),
      {
        title: 'Delete Permanently',
        message: 'Delete from the archive permanently? This cannot be undone.',
        lines: [
          { label: 'Item', name: 'a.txt' },
          { label: 'Archive', name: 'photos.zip' },
        ],
        confirm: 'Delete Permanently',
      },
    );
  });
});
