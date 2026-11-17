import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { namedItem, plainOf } from '../../../../lib/shared/sentences';
import { strings } from '../../../../lib/shared/strings';

suite('Sentences', () => {
  test('keeps the names in a sentence apart from its words, joining the words between them, nesting a reason with names of its own, and quotes the names in its plain form, for the log', () => {
    const pushed = strings.messages.pushed('main', 'origin/main');
    assert.deepStrictEqual(pushed, [
      'Pushed ',
      { name: 'main' },
      ' to ',
      { name: 'origin/main' },
    ]);
    assert.strictEqual(plainOf(pushed), 'Pushed "main" to "origin/main"');
    assert.deepStrictEqual(
      strings.commander.copyFailed(
        'a.txt',
        strings.commander.archiveGone('b.zip'),
      ),
      [
        { name: 'a.txt', path: 'file' },
        ' could not be copied: ',
        { name: 'b.zip', path: 'file' },
        ' is no longer there, so it was not changed.',
      ],
    );
  });

  test('keeps a sentence without names a string, as its plain form', () => {
    assert.strictEqual(
      strings.messages.couldNotPull('It timed out.'),
      "Couldn't pull. It timed out.",
    );
    assert.strictEqual(
      strings.commander.testPassed(strings.commander.items(2)),
      '2 items passed the test.',
    );
    assert.strictEqual(plainOf('Fetched'), 'Fetched');
  });

  test('names an item by its whole path, as a file unless said to be a folder, so the folder it is in is never left to be guessed', () => {
    assert.deepStrictEqual(namedItem('C:\\Code\\app\\src\\lib', 'folder'), {
      name: 'C:\\Code\\app\\src\\lib',
      path: 'folder',
    });
    assert.deepStrictEqual(namedItem('/home/me/build.sh'), {
      name: '/home/me/build.sh',
      path: 'file',
    });
    assert.strictEqual(
      plainOf(strings.commander.copyFailed('/home/me/a.txt', 'It is gone.')),
      '"/home/me/a.txt" could not be copied: It is gone.',
    );
  });

  test('names the item a dialog renames by its whole path on a line of its own, with no label, as the title says what it does', () => {
    assert.deepStrictEqual(strings.commander.itemLines('/home/me/a.txt'), [
      { name: '/home/me/a.txt', path: 'file' },
    ]);
  });
});
