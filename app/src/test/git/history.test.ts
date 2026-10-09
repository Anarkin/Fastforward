import * as assert from 'node:assert';
import {
  matchesCommit,
  parseHistory,
  parseLog,
  parseSearchedCommit,
  recentTips,
  SearchMatches,
  takeRecords,
} from '../../git/history';

suite('Git log parser', () => {
  test('parses only what the commit list shows of each commit', () => {
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
        authorName: 'Ann',
        commitDate: 1_700_000_100_000,
      },
      {
        hash: 'bbb',
        subject: 'Root',
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
    const output = '\x1eaaa\0Ann\x001700000000\0subject\r\n\r\nbody\r\n\0';
    assert.strictEqual(parseLog(output)[0].subject, 'subject');
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

suite('Recent tips', () => {
  const day = 24 * 60 * 60;

  test('picks the commits of the refs updated within 60 days of the newest one, however long ago that was', () => {
    const newest = 1_000_000_000;
    const dates = new Map([
      ['old', newest - 61 * day],
      ['new', newest],
      ['edge', newest - 60 * day],
    ]);
    assert.deepStrictEqual(recentTips(dates), ['new', 'edge']);
  });

  test('picks nothing without refs', () => {
    assert.deepStrictEqual(recentTips(new Map()), []);
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

  test('finds the text in any of them, ignoring case, emails and the description included', () => {
    assert.strictEqual(matchesCommit(commit, 'LOVELACE'), true);
    assert.strictEqual(matchesCommit(commit, 'TEST@'), true);
    assert.strictEqual(matchesCommit(commit, 'body'), true);
    assert.strictEqual(matchesCommit(commit, 'nothing'), false);
  });
});

suite('Commit search stream', () => {
  test('cuts the commits by their fields, whatever their messages hold, keeping the unfinished one', () => {
    assert.deepStrictEqual(
      takeRecords(
        'aaa\0A\0a@x\0B\0b@x\0One\x1eline\n\0bbb\0A\0a@x\0B\0b@x\0Two\n\0ccc\0A',
      ),
      {
        records: [
          'aaa\0A\0a@x\0B\0b@x\0One\x1eline\n',
          'bbb\0A\0a@x\0B\0b@x\0Two\n',
        ],
        rest: 'ccc\0A',
      },
    );
  });

  test('takes the commits that match from the one walk of the history, settling at one past the limit without waiting for the rest', () => {
    const matches = new SearchMatches('ada', 2);
    assert.strictEqual(
      matches.add('aaa\0Ada\0a@x\0B\0b@x\0About ada'),
      undefined,
    );
    assert.strictEqual(matches.add('bbb\0B\0b@x\0B\0b@x\0Nothing'), undefined);
    assert.strictEqual(matches.add('ccc\0B\0b@x\0Ada\0a@x\0'), undefined);
    assert.deepStrictEqual(matches.add('ddd\0B\0b@x\0B\0b@x\0ADA'), {
      found: ['aaa', 'ccc'],
      capped: true,
    });
  });

  test('stops at 50 matches unless told another limit', () => {
    const matches = new SearchMatches('ada');
    for (let i = 0; i < 50; i++) {
      assert.strictEqual(matches.add(`h${i}\0Ada\0a@x\0B\0b@x\0`), undefined);
    }
    assert.strictEqual(matches.add('last\0Ada\0a@x\0B\0b@x\0')?.capped, true);
  });

  test('ends after the last commit, with every match in any letters', () => {
    const matches = new SearchMatches('ada', 5);
    matches.add('aaa\0Ada\0a@x\0B\0b@x\0');
    matches.add('bbb\0B\0b@x\0B\0b@x\0Nothing');
    assert.deepStrictEqual(matches.end(), {
      found: ['aaa'],
      capped: false,
    });
    const whole = new SearchMatches('ÉLAN', 5);
    whole.add('aaa\0B\0b@x\0B\0b@x\0élan');
    assert.deepStrictEqual(whole.end(), {
      found: ['aaa'],
      capped: false,
    });
  });
});
