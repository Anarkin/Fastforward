import * as assert from 'node:assert';
import {
  matchedFields,
  messageGrep,
  parseHistory,
  parseLog,
  parseSearchedCommit,
  SearchMerge,
} from '../git/history';

suite('Git log parser', () => {
  test('parses commits', () => {
    const output = [
      '\x1eaaa\0p1 p2\0Ann\0ann@example.com\0',
      '1700000000\0Carl\0carl@example.com\0',
      '1700000100\0Subject\n\nBody\n\0',
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
      },
    ]);
  });

  test('reads a message with \\x1e in it', () => {
    const output = [
      '\x1eaaa\0\0Ann\0ann@example.com\0',
      '1700000000\0Ann\0ann@example.com\0',
      '1700000000\0Subject\n\n\x1ebbb\n\0',
      '\x1eccc\0aaa\0Bob\0bob@example.com\0',
      '1700000100\0Bob\0bob@example.com\0',
      '1700000100\0Next\n\0',
    ].join('');
    assert.deepStrictEqual(
      parseLog(output).map(({ hash, message, parents }) => ({
        hash,
        message,
        parents,
      })),
      [
        { hash: 'aaa', message: 'Subject\n\n\x1ebbb', parents: [] },
        { hash: 'ccc', message: 'Next', parents: ['aaa'] },
      ],
    );
  });

  test('reads a message written with CRLF line endings', () => {
    const output = [
      '\x1eaaa\0\0Ann\0ann@example.com\0',
      '1700000000\0Ann\0ann@example.com\0',
      '1700000000\0subject\r\n\r\nbody\r\nmore\r\n\0',
    ].join('');
    const [{ subject, message }] = parseLog(output);
    assert.deepStrictEqual(
      { subject, message },
      { subject: 'subject', message: 'subject\n\nbody\nmore' },
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

suite('Commit search matching', () => {
  const commit = parseSearchedCommit(
    'aaa\0Ada Lovelace\0ada@example.com\0Test\0test@example.com\0Subject\n\nBody about ADA\n',
  );

  test('reads the hash, the author and committer with their emails, and the whole message', () => {
    assert.deepStrictEqual(commit, {
      hash: 'aaa',
      author: 'Ada Lovelace <ada@example.com>',
      committer: 'Test <test@example.com>',
      message: 'Subject\n\nBody about ADA\n',
    });
  });

  test('says which of them contain the text, ignoring case, emails and the description included', () => {
    assert.deepStrictEqual(matchedFields(commit, 'ada'), ['author', 'message']);
    assert.deepStrictEqual(matchedFields(commit, 'TEST@'), ['committer']);
    assert.deepStrictEqual(matchedFields(commit, 'body'), ['message']);
    assert.deepStrictEqual(matchedFields(commit, 'nothing'), []);
  });
});

suite('Commit search streams', () => {
  test('leaves the messages to git for printable ASCII text, taken literally and ignoring case', () => {
    assert.deepStrictEqual(messageGrep('Fix (a+b)*[c]\\d?'), [
      '--regexp-ignore-case',
      '--fixed-strings',
      '--grep=Fix (a+b)*[c]\\d?',
    ]);
    for (const query of ['', 'élan', 'line\nbreak']) {
      assert.deepStrictEqual(messageGrep(query), [], query);
    }
  });

  test('goes through every commit in order, waiting for the commits whose message matched, until the limit', () => {
    const merge = new SearchMerge('ada', 2, false);
    assert.strictEqual(merge.addIdent('aaa\0Ada\0a@x\0B\0b@x'), undefined);
    assert.strictEqual(merge.addIdent('bbb\0B\0b@x\0B\0b@x'), undefined);
    assert.strictEqual(merge.addIdent('ccc\0B\0b@x\0B\0b@x'), undefined);
    assert.strictEqual(merge.addIdent('ddd\0B\0b@x\0Ada\0a@x'), undefined);
    assert.strictEqual(
      merge.addMessage('aaa\0Ada\0a@x\0B\0b@x\0About ada'),
      undefined,
    );
    assert.strictEqual(merge.addMessage('ccc\0B\0b@x\0B\0b@x\0ADA'), undefined);
    assert.deepStrictEqual(merge.endMessages(), {
      found: [
        { hash: 'aaa', fields: ['author', 'message'] },
        { hash: 'ccc', fields: ['message'] },
      ],
      capped: true,
    });
  });

  test('ends after the last commit, finding by their names the commits git matched no message of', () => {
    const merge = new SearchMerge('ada', 5, false);
    merge.addIdent('aaa\0Ada\0a@x\0B\0b@x');
    assert.strictEqual(merge.endIdents(), undefined);
    assert.deepStrictEqual(merge.endMessages(), {
      found: [{ hash: 'aaa', fields: ['author'] }],
      capped: false,
    });
    const whole = new SearchMerge('ÉLAN', 5, true);
    whole.addIdent('aaa\0B\0b@x\0B\0b@x\0élan');
    assert.deepStrictEqual(whole.endIdents(), {
      found: [{ hash: 'aaa', fields: ['message'] }],
      capped: false,
    });
  });
});
