import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  bookmarkKey,
  bookmarkMenu,
  bookmarkOf,
} from '../../../../tools/commander/page/bookmarks';
import { strings } from '../../../../lib/shared/strings';
import { noop } from '../../../fixtures';
import type { ContextMenuItem } from '../../../../lib/page/contextMenu';

const shown = (items: readonly ContextMenuItem[]) =>
  items.map((item) =>
    'separator' in item
      ? '---'
      : [
          item.label,
          item.accessKey ?? '',
          item.checked ?? false,
          item.showAccessKey ?? false,
          item.removeTitle ?? '',
        ],
  );

suite('Commander bookmarks menu', () => {
  test('sets each bookmark apart as a name, as it is a folder, and the actions in the words of the menu', () => {
    const items = bookmarkMenu({
      bookmarks: ['C:\\Code'],
      bookmark: undefined,
      onAdd: noop,
      onRemove: noop,
      onGo: noop,
    });
    assert.deepStrictEqual(
      items.map((item) => ('separator' in item ? '---' : (item.name ?? false))),
      [false, '---', true],
    );
  });

  test('offers to add the folder of the side, then past a line every bookmark, each with its key before it and an X removing it', () => {
    const done: string[] = [];
    const items = bookmarkMenu({
      bookmarks: ['C:\\Code', 'D:\\Work'],
      bookmark: undefined,
      onAdd: () => done.push('add'),
      onRemove: (folder) => done.push(`remove ${folder}`),
      onGo: (folder) => done.push(`go ${folder}`),
    });
    assert.deepStrictEqual(shown(items), [
      [strings.commander.addBookmark, '', false, false, ''],
      '---',
      [
        'C:\\Code',
        '1',
        false,
        true,
        strings.commander.removeBookmarkOf('C:\\Code'),
      ],
      [
        'D:\\Work',
        '2',
        false,
        true,
        strings.commander.removeBookmarkOf('D:\\Work'),
      ],
    ]);
    for (const item of items) {
      if (!('separator' in item)) {
        item.onClick?.();
        item.onRemove?.();
      }
    }
    assert.deepStrictEqual(done, [
      'add',
      'go C:\\Code',
      'remove C:\\Code',
      'go D:\\Work',
      'remove D:\\Work',
    ]);
  });

  test('offers to remove the bookmark of the folder of the side once it has one, checked among the others', () => {
    const removed: string[] = [];
    const items = bookmarkMenu({
      bookmarks: ['C:\\Code', 'D:\\Work'],
      bookmark: 'D:\\Work',
      onAdd: noop,
      onRemove: (folder) => removed.push(folder),
      onGo: noop,
    });
    const [first] = items;
    assert.ok(first !== undefined && !('separator' in first));
    assert.strictEqual(first.label, strings.commander.removeBookmark);
    first.onClick?.();
    assert.deepStrictEqual(removed, ['D:\\Work']);
    assert.deepStrictEqual(
      items.flatMap((item) =>
        'separator' in item || item.checked === undefined
          ? []
          : [[item.label, item.checked]],
      ),
      [
        ['C:\\Code', false],
        ['D:\\Work', true],
      ],
    );
  });

  test('offers only to add a bookmark while there is none, with no line under it', () => {
    assert.deepStrictEqual(
      shown(
        bookmarkMenu({
          bookmarks: [],
          bookmark: undefined,
          onAdd: noop,
          onRemove: noop,
          onGo: noop,
        }),
      ),
      [[strings.commander.addBookmark, '', false, false, '']],
    );
  });

  test('keys the first nine bookmarks 1 to 9 and the next 26 A to Z, leaving the rest without a key', () => {
    assert.deepStrictEqual(
      [0, 8, 9, 34, 35].map((index) => bookmarkKey(index)),
      ['1', '9', 'A', 'Z', undefined],
    );
  });

  test('finds the bookmark of the folder of a side whatever the case of its letters on Windows and macOS, and none before the side shows a folder', () => {
    const bookmarks = ['C:\\Code', '/Users/adam'];
    assert.strictEqual(bookmarkOf(bookmarks, 'c:\\code', 'win32'), 'C:\\Code');
    assert.strictEqual(
      bookmarkOf(bookmarks, '/users/Adam', 'darwin'),
      '/Users/adam',
    );
    assert.strictEqual(
      bookmarkOf(bookmarks, '/users/adam', 'linux'),
      undefined,
    );
    assert.strictEqual(bookmarkOf(bookmarks, 'D:\\Code', 'win32'), undefined);
    assert.strictEqual(bookmarkOf(bookmarks, undefined, 'win32'), undefined);
  });
});
