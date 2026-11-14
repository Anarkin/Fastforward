import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  shownBookmarks,
  withBookmark,
  withoutBookmark,
} from '../../../../../tools/commander/main/bookmarks';

const windows = { paths: path.win32, platform: 'win32' } as const;
const mac = { paths: path.posix, platform: 'darwin' } as const;
const linux = { paths: path.posix, platform: 'linux' } as const;

suite('Commander bookmarks', () => {
  test('shows the bookmarks that are whole paths on the system, as it opens them, once each, sorted by their letters and numbers whatever their case, leaving out those of another system or relative to nothing', () => {
    assert.deepStrictEqual(
      shownBookmarks(
        [
          'D:\\Work',
          'c:/code/',
          'C:\\Code',
          'C:\\Code\\folder10',
          'C:\\Code\\folder9',
          '\\\\server\\share\\docs\\',
          '/Users/adam',
          'Downloads',
          'C:',
        ],
        windows,
      ),
      [
        '\\\\server\\share\\docs',
        'c:\\code',
        'C:\\Code\\folder9',
        'C:\\Code\\folder10',
        'D:\\Work',
      ],
    );
    assert.deepStrictEqual(
      shownBookmarks(['/srv/', 'C:\\Code', 'Downloads', '/home/adam'], linux),
      ['/home/adam', '/srv'],
    );
    assert.deepStrictEqual(
      shownBookmarks(['/Users/Adam', '/users/adam', '/Users/adam/Code'], mac),
      ['/Users/Adam', '/Users/adam/Code'],
    );
    assert.deepStrictEqual(
      shownBookmarks(['/home/adam', '/home/Adam'], linux),
      ['/home/Adam', '/home/adam'],
    );
  });

  test('adds a folder at the end, keeping the bookmarks as written, those of another system too, and none for a folder bookmarked already, however it was written', () => {
    const stored = ['C:\\Code', '/Users/adam'];
    assert.deepStrictEqual(withBookmark(stored, 'D:\\Work', windows), [
      'C:\\Code',
      '/Users/adam',
      'D:\\Work',
    ]);
    assert.strictEqual(withBookmark(stored, 'C:\\Code', windows), stored);
    const written = ['c:/code/'];
    assert.strictEqual(withBookmark(written, 'C:\\Code', windows), written);
    assert.deepStrictEqual(withBookmark(['/home/adam'], '/home/Adam', linux), [
      '/home/adam',
      '/home/Adam',
    ]);
    assert.strictEqual(withBookmark(stored, 'Downloads', windows), stored);
  });

  test('removes every way a folder is written among the bookmarks, keeping the others as written, those of another system too, and the list as it was for a folder not bookmarked', () => {
    const stored = [
      'c:/code/',
      'D:\\Work',
      'C:\\Code',
      '/Users/adam',
      'Downloads',
    ];
    assert.deepStrictEqual(withoutBookmark(stored, 'C:\\Code', windows), [
      'D:\\Work',
      '/Users/adam',
      'Downloads',
    ]);
    assert.strictEqual(withoutBookmark(stored, 'E:\\Music', windows), stored);
    assert.strictEqual(withoutBookmark(stored, 'Downloads', windows), stored);
    assert.deepStrictEqual(
      withoutBookmark(['/home/adam', '/home/Adam'], '/home/Adam', linux),
      ['/home/adam'],
    );
  });
});
