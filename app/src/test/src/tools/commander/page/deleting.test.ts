import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { deleteQuestion } from '../../../../../tools/commander/page/deleting';

suite('Commander deleting', () => {
  test('names what it moves to the Recycle Bin on Windows and to the Trash elsewhere on a line of its own, a single item by its whole path and more by their count, with no question or label, as the title and the buttons ask it', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], false, 'win32'), {
      title: 'Delete',
      lines: [{ name: 'a.txt', path: 'file' }],
      confirm: 'Move to the Recycle Bin',
    });
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'b', 'c'], false, 'darwin'),
      {
        title: 'Delete',
        lines: [{ text: '3 items' }],
        confirm: 'Move to the Trash',
      },
    );
    assert.deepStrictEqual(
      deleteQuestion(['lib'], false, 'darwin', false, undefined, '/code/src')
        .lines,
      [{ name: '/code/src/lib', path: 'file' }],
    );
  });

  test('names what it deletes permanently alike, the title and the button saying it is for good', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], true, 'win32'), {
      title: 'Delete Permanently',
      lines: [{ name: 'a.txt', path: 'file' }],
      confirm: 'Delete Permanently',
    });
    assert.deepStrictEqual(deleteQuestion(['a.txt', 'b'], true, 'linux'), {
      title: 'Delete Permanently',
      lines: [{ text: '2 items' }],
      confirm: 'Delete Permanently',
    });
  });

  test('says why it deletes permanently on a drive whose Recycle Bin is turned off, as F8 asked for the Recycle Bin and Delete failed there saying only that the delete operation failed', () => {
    assert.deepStrictEqual(deleteQuestion(['a.txt'], true, 'win32', true), {
      title: 'Delete Permanently',
      message: 'The Recycle Bin of this drive is turned off.',
      lines: [{ name: 'a.txt', path: 'file' }],
      confirm: 'Delete Permanently',
    });
  });

  test('deletes from an archive permanently, naming the archive by its whole path on a line of its own, lined up with what it deletes, as an archive has no Recycle Bin', () => {
    assert.deepStrictEqual(
      deleteQuestion(['a.txt', 'docs'], true, 'linux', false, '/x/photos.zip'),
      {
        title: 'Delete Permanently',
        lines: [
          { label: '', text: '2 items' },
          { label: 'Archive', name: '/x/photos.zip', path: 'file' },
        ],
        confirm: 'Delete Permanently',
      },
    );
    assert.deepStrictEqual(
      deleteQuestion(
        ['a.txt'],
        true,
        'win32',
        false,
        'C:\\x\\photos.zip',
        'C:\\x\\photos.zip\\docs',
      ).lines,
      [
        { label: '', name: 'C:\\x\\photos.zip\\docs\\a.txt', path: 'file' },
        { label: 'Archive', name: 'C:\\x\\photos.zip', path: 'file' },
      ],
    );
  });
});
