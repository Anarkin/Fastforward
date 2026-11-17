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

  test('names the folder a dialog refuses to open by its whole path on a line of its own, with no label, as the title says what is wrong', () => {
    assert.deepStrictEqual(strings.commander.folderLines('/root/secret'), [
      { name: '/root/secret', path: 'folder' },
    ]);
  });

  test('names the file of a question about saving it, or putting it back into its archive, by its whole path with no label on its first line, as the title says what it asks, labeling only the archive it goes into', () => {
    assert.deepStrictEqual(strings.editor.overwriteLines('/home/me/a.txt'), [
      { name: '/home/me/a.txt', path: 'file' },
    ]);
    assert.deepStrictEqual(
      strings.commander.updateLines(
        '/home/me/a.zip/docs/a.txt',
        '/home/me/a.zip',
      ),
      [
        { label: '', name: '/home/me/a.zip/docs/a.txt', path: 'file' },
        { label: 'Archive', name: '/home/me/a.zip', path: 'file' },
      ],
    );
  });

  test('says why it asks before making a repository inside another, or reopening a file in another encoding, without asking it again, the buttons asking it', () => {
    assert.strictEqual(
      strings.confirm.initInside,
      'This folder is inside another repository.',
    );
    assert.deepStrictEqual(
      strings.confirm.initInsideLines('/code/a/b', '/code/a'),
      [
        { label: '', name: '/code/a/b', path: 'folder' },
        { label: 'Repository', name: '/code/a', path: 'folder' },
      ],
    );
    assert.strictEqual(
      strings.editor.reopenAsked,
      'Reopening the file in another encoding drops the changes made here.',
    );
  });
});
