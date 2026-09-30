import * as assert from 'node:assert';
import { parseHistory, parseLog } from '../git/history';

suite('Git log parser', () => {
  test('parses commits and counts their files', () => {
    const output = [
      '\x1eaaa\0p1 p2\0Ann\0ann@example.com\0',
      '1700000000\0Carl\0carl@example.com\0',
      '1700000100\0Subject\n\nBody\n\0',
      '\n:100644 100644 1111111 2222222 M\0a.ts\0',
      ':000000 100644 0000000 3333333 A\0b.ts\0',
      '\x1ebbb\0\0Bob\0bob@example.com\0',
      '1600000000\0Bob\0bob@example.com\0',
      '1600000000\0Root\n\0',
    ].join('');
    assert.deepStrictEqual(parseLog(output), [
      {
        hash: 'aaa',
        subject: 'Subject',
        message: 'Subject\n\nBody',
        parents: ['p1', 'p2'],
        authorName: 'Ann',
        authorEmail: 'ann@example.com',
        authorDate: 1_700_000_000_000,
        committerName: 'Carl',
        committerEmail: 'carl@example.com',
        commitDate: 1_700_000_100_000,
        files: 2,
      },
      {
        hash: 'bbb',
        subject: 'Root',
        message: 'Root',
        parents: [],
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
        authorDate: 1_600_000_000_000,
        committerName: 'Bob',
        committerEmail: 'bob@example.com',
        commitDate: 1_600_000_000_000,
        files: 0,
      },
    ]);
  });

  test('reads a message with \\x1e in it, and paths that look like fields', () => {
    const output = [
      '\x1eaaa\0\0Ann\0ann@example.com\0',
      '1700000000\0Ann\0ann@example.com\0',
      '1700000000\0Subject\n\n\x1ebbb\n\0',
      '\n:000000 100644 0000000 1111111 A\0:memo.txt\0',
      ':000000 100644 0000000 2222222 A\0\x1eodd.txt\0',
      '\x1eccc\0aaa\0Bob\0bob@example.com\0',
      '1700000100\0Bob\0bob@example.com\0',
      '1700000100\0Next\n\0',
    ].join('');
    assert.deepStrictEqual(
      parseLog(output).map(({ hash, message, parents, files }) => ({
        hash,
        message,
        parents,
        files,
      })),
      [
        { hash: 'aaa', message: 'Subject\n\n\x1ebbb', parents: [], files: 2 },
        { hash: 'ccc', message: 'Next', parents: ['aaa'], files: 0 },
      ],
    );
  });

  test('counts a renamed or copied file once', () => {
    const output = [
      '\x1eaaa\0\0Ann\0ann@example.com\0',
      '1700000000\0Ann\0ann@example.com\0',
      '1700000000\0Move\n\0',
      '\n:100644 100644 1111111 1111111 R100\0old.txt\0new.txt\0',
      ':100644 100644 2222222 2222222 C075\0a.txt\0b.txt\0',
      '\x1ebbb\0aaa\0Bob\0bob@example.com\0',
      '1700000100\0Bob\0bob@example.com\0',
      '1700000100\0Next\n\0',
    ].join('');
    assert.deepStrictEqual(
      parseLog(output).map(({ hash, files }) => ({ hash, files })),
      [
        { hash: 'aaa', files: 2 },
        { hash: 'bbb', files: 0 },
      ],
    );
  });
});

suite('Git rev-list parser', () => {
  test('parses hashes and parents', () => {
    assert.deepStrictEqual(parseHistory('aaa bbb ccc\nbbb\n'), [
      { hash: 'aaa', parents: ['bbb', 'ccc'] },
      { hash: 'bbb', parents: [] },
    ]);
  });
});
