import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { flatRowOf, rowsOf } from '../../../../../tools/commander/page/listing';
import {
  keysMatching,
  patternMatcher,
} from '../../../../../tools/commander/page/markPattern';
import { entry, folder } from './listingFixtures';

const matching = (pattern: string, platform: string) => {
  const matches = patternMatcher(pattern, platform);
  return [
    'photo.jpg',
    'Photo.JPG',
    'photo.jpeg',
    'a.png',
    'ab.png',
    'notes.txt',
  ].filter((name) => matches(name));
};

suite('Marking the rows of a side by a pattern', () => {
  test('takes the names a pattern matches, * for any characters and ? for one, several patterns apart by semicolons, ignoring case on Windows and macOS as their file systems do', () => {
    assert.deepStrictEqual(matching('*.jpg', 'linux'), ['photo.jpg']);
    assert.deepStrictEqual(matching('*.jpg', 'win32'), [
      'photo.jpg',
      'Photo.JPG',
    ]);
    assert.deepStrictEqual(matching('?.png; *.jpeg', 'darwin'), [
      'photo.jpeg',
      'a.png',
    ]);
    assert.deepStrictEqual(matching('notes.txt', 'linux'), ['notes.txt']);
    assert.deepStrictEqual(matching('*', 'linux').length, 6);
    assert.deepStrictEqual(matching(' ; ', 'linux'), []);
    assert.deepStrictEqual(matching('(a).png', 'linux'), []);
  });

  test('gives the keys of the rows whose names a pattern matches, folders too, a file shown flat by its name alone, and never the parent folder', () => {
    const rows = [
      ...rowsOf(
        [entry('a.jpg'), entry('b.png'), folder('album.jpg'), folder('docs')],
        true,
        true,
        { column: 'name', descending: false, groupByColor: false },
      ),
      flatRowOf(entry('c.jpg'), 'sub\\'),
    ];

    assert.deepStrictEqual(keysMatching(rows, '*.jpg', 'win32'), [
      'album.jpg',
      'a.jpg',
      'sub\\c.jpg',
    ]);
    assert.deepStrictEqual(
      keysMatching(rows, '*', 'win32').includes('..'),
      false,
    );
  });
});
