import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainOf } from '../../../../lib/shared/sentences';
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
});
