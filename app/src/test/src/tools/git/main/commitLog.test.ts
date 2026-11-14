import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { parseLog } from '../../../../../tools/git/main/commitLog';

suite('Git log parser', () => {
  test('parses what the commit list shows of each commit, the rest of its message after the subject included', () => {
    const output = [
      '\x1eaaa\0Ann\0',
      '1700000100\0Subject\n\nBody\n\0',
      '\x1ebbb\0Bob\0',
      '1600000000\0Root\n\0',
    ].join('');
    assert.deepStrictEqual(parseLog(output), [
      {
        hash: 'aaa',
        subject: 'Subject',
        body: 'Body',
        authorName: 'Ann',
        commitDate: 1_700_000_100_000,
      },
      {
        hash: 'bbb',
        subject: 'Root',
        body: '',
        authorName: 'Bob',
        commitDate: 1_600_000_000_000,
      },
    ]);
  });

  test('reads a message with \\x1e in it', () => {
    const output = [
      '\x1eaaa\0Ann\0',
      '1700000000\0Subject\n\n\x1ebbb\n\0',
      '\x1eccc\0Bob\0',
      '1700000100\0Next\n\0',
    ].join('');
    assert.deepStrictEqual(
      parseLog(output).map(({ hash, subject }) => ({ hash, subject })),
      [
        { hash: 'aaa', subject: 'Subject' },
        { hash: 'ccc', subject: 'Next' },
      ],
    );
  });

  test('reads a message written with CRLF line endings', () => {
    const output =
      '\x1eaaa\0Ann\x001700000000\0subject\r\n\r\nbody\r\nmore\r\n\0';
    assert.strictEqual(parseLog(output)[0].subject, 'subject');
    assert.strictEqual(parseLog(output)[0].body, 'body\nmore');
  });

  test('keeps the lines and indentation of the rest of a message, dropping only the blank lines before it', () => {
    const output =
      '\x1eaaa\0Ann\x001700000000\0Subject\n\n \n  - one\n\n  - two\n\n\0';
    assert.strictEqual(parseLog(output)[0].body, '  - one\n\n  - two');
  });
});
